import os
os.environ['OPENBLAS_NUM_THREADS'] = '1'
if 'GROQ_API_KEY' not in os.environ:
    os.environ['GROQ_API_KEY'] = os.getenv('GROQ_API_KEY', '')
os.environ['OLLAMA_URL'] = 'http://localhost:19999' # Force Groq fallback for test
import asyncio
import json
import discover

async def mock_search(query, page=1):
    print(f"[Mock Search] Searching page {page}")
    if page == 1:
        return [
            {
                'url': 'https://kuka.com',
                'title': 'KUKA Robotics Systems',
                'content': 'KUKA is a global automation powerhouse providing industrial robots.'
            },
            {
                'url': 'https://fanucamerica.com',
                'title': 'FANUC America',
                'content': 'FANUC provides CNC systems, robotics, and factory automation.'
            }
        ]
    elif page == 2:
        return [
            {
                'url': 'https://abb.com',
                'title': 'ABB Robotics',
                'content': 'ABB is a technology leader in electrification and automation.'
            }
        ]
    return []

discover.search_searxng_or_ddg = mock_search

async def main():
    print("Testing auto-pagination & NDJSON streaming...")
    received_events = []
    async for line in discover.stream_discovery(keyword='Robotics', start_page=1, target_count=2, max_pages=3):
        data = json.loads(line.strip())
        received_events.append(data)
        print(f"STREAM EVENT: {data.get('type')} -> {data}")

    print("\nTotal Stream Events Received:", len(received_events))
    companies = [e for e in received_events if e.get('type') == 'company']
    print(f"Qualified Companies Received: {len(companies)}")

if __name__ == '__main__':
    asyncio.run(main())
