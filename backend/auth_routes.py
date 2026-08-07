import os
import json
import urllib.request
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from typing import Optional, List, Any
from sqlalchemy.orm import Session

from auth_models import Company, get_auth_db
from auth_utils import hash_password, verify_password, create_access_token, decode_access_token
import database

# Load environment from root .env.local if present
env_local_path = os.path.join(os.path.dirname(__file__), "..", ".env.local")
if os.path.exists(env_local_path):
    load_dotenv(env_local_path)
load_dotenv()

router = APIRouter(prefix="/auth", tags=["Authentication"])
security = HTTPBearer()

# In-memory cache for company-specific suggested industries
_SUGGESTED_INDUSTRIES_CACHE = {}

# ─── Pydantic Schemas ──────────────────────────────────────────────────────────

class CompanySignupRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    website: Optional[str] = None
    industry: Optional[str] = None
    services: Optional[str] = None
    target_customers: Optional[str] = None
    description: Optional[str] = None

class CompanyLoginRequest(BaseModel):
    email: EmailStr
    password: str

class CompanyResponse(BaseModel):
    id: int
    name: str
    email: str
    website: Optional[str] = None
    industry: Optional[str] = None
    services: Optional[str] = None
    target_customers: Optional[str] = None
    description: Optional[str] = None
    logo_path: Optional[str] = None

    class Config:
        from_attributes = True

class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    company: CompanyResponse

class DashboardStatsResponse(BaseModel):
    company_id: int
    company_name: str
    total_companies_found: int
    qualified_leads: int
    active_outreach: int
    avg_trust_score: float
    recent_activity: List[Any] = []

class SuggestedIndustriesResponse(BaseModel):
    company_id: int
    company_name: str
    suggested_industries: List[str]


# ─── Auth Endpoints ────────────────────────────────────────────────────────────

@router.post("/signup", response_model=AuthTokenResponse, status_code=status.HTTP_201_CREATED)
def signup(company_data: CompanySignupRequest, db: Session = Depends(get_auth_db)):
    """Registers a new Company and returns a JWT access token."""
    existing = db.query(Company).filter(Company.email == company_data.email.lower().strip()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A company with this email address is already registered."
        )

    hashed_pwd = hash_password(company_data.password)
    new_company = Company(
        name=company_data.name.strip(),
        email=company_data.email.lower().strip(),
        hashed_password=hashed_pwd,
        website=company_data.website.strip() if company_data.website else None,
        industry=company_data.industry.strip() if company_data.industry else None,
        services=company_data.services.strip() if company_data.services else None,
        target_customers=company_data.target_customers.strip() if company_data.target_customers else None,
        description=company_data.description.strip() if company_data.description else None
    )

    db.add(new_company)
    db.commit()
    db.refresh(new_company)

    token = create_access_token(data={"sub": str(new_company.id), "email": new_company.email})

    return AuthTokenResponse(
        access_token=token,
        token_type="bearer",
        company=CompanyResponse.model_validate(new_company)
    )


@router.post("/login", response_model=AuthTokenResponse)
def login(login_data: CompanyLoginRequest, db: Session = Depends(get_auth_db)):
    """Authenticates an existing Company and returns a JWT access token."""
    company = db.query(Company).filter(Company.email == login_data.email.lower().strip()).first()
    if not company or not verify_password(login_data.password, company.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password credentials."
        )

    token = create_access_token(data={"sub": str(company.id), "email": company.email})

    return AuthTokenResponse(
        access_token=token,
        token_type="bearer",
        company=CompanyResponse.model_validate(company)
    )


@router.get("/me", response_model=CompanyResponse)
def get_current_company(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_auth_db)):
    """Decodes JWT bearer token and returns the profile of the current authenticated Company."""
    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid, expired, or missing JWT authorization token."
        )

    company_id = int(payload["sub"])
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Authenticated company profile not found."
        )

    return CompanyResponse.model_validate(company)


@router.get("/dashboard-stats", response_model=DashboardStatsResponse)
def get_dashboard_stats_endpoint(current_company: Company = Depends(get_current_company)):
    """Returns real-time multi-tenant dashboard stats isolated to current_company.id."""
    stats = database.get_dashboard_stats(current_company.id)
    stats["company_name"] = current_company.name
    return stats


@router.get("/suggest-industries", response_model=SuggestedIndustriesResponse)
def get_suggested_industries_endpoint(current_company: Company = Depends(get_current_company)):
    """
    Generates dynamic, company-profile aware target industry recommendations using Groq LLM.
    Caches results per company_id to respect Groq API rate limits.
    """
    company_id = current_company.id
    if company_id in _SUGGESTED_INDUSTRIES_CACHE:
        return SuggestedIndustriesResponse(
            company_id=company_id,
            company_name=current_company.name,
            suggested_industries=_SUGGESTED_INDUSTRIES_CACHE[company_id]
        )

    default_tags = ["Fintech", "Healthcare", "E-Commerce & Retail", "Software & SaaS", "Logistics & Supply Chain", "Industrial Manufacturing"]

    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        print("[Suggest Industries Groq]: GROQ_API_KEY is missing in env")
        return SuggestedIndustriesResponse(
            company_id=company_id,
            company_name=current_company.name,
            suggested_industries=default_tags
        )

    prompt = f"""
    We are '{current_company.name}', operating in the '{current_company.industry or 'Technology'}' sector.
    Our products/services: '{current_company.services or current_company.description or 'B2B Products & Services'}'.
    Our ideal target clients: '{current_company.target_customers or 'Enterprise B2B companies'}'.

    Identify 6 high-value target industry verticals or sectors where our solutions provide strong business ROI.
    Return ONLY a JSON object with key "suggested_industries" containing 6 short industry titles (1-3 words each), e.g.:
    {{"suggested_industries": ["Fintech & Banking", "Healthcare Systems", "Cloud Infrastructure", "E-Commerce", "Government", "Logistics"]}}
    """

    try:
        req_data = json.dumps({
            "model": os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"),
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
            "max_tokens": 300,
            "response_format": {"type": "json_object"}
        }).encode("utf-8")

        req = urllib.request.Request(
            "https://api.groq.com/openai/v1/chat/completions",
            data=req_data,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {groq_key}",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ClientPlus-AI/1.0"
            },
            method="POST"
        )

        with urllib.request.urlopen(req, timeout=10) as response:
            resp_body = response.read().decode("utf-8")
            data = json.loads(resp_body)
            raw_content = data["choices"][0]["message"]["content"]
            parsed = json.loads(raw_content)
            industries = parsed.get("suggested_industries", default_tags)
            if isinstance(industries, list) and len(industries) > 0:
                clean_tags = [str(t).strip() for t in industries if isinstance(t, str) and len(t.strip()) > 0][:6]
                _SUGGESTED_INDUSTRIES_CACHE[company_id] = clean_tags
                return SuggestedIndustriesResponse(
                    company_id=company_id,
                    company_name=current_company.name,
                    suggested_industries=clean_tags
                )
    except Exception as e:
        print(f"[Suggest Industries Groq Error]: {e}")

    return SuggestedIndustriesResponse(
        company_id=company_id,
        company_name=current_company.name,
        suggested_industries=default_tags
    )
