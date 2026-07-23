'use client';

import React, { useState, useRef, useEffect } from 'react';
import countriesData from '@/data/countries-cities.json';

export interface CountryItem {
  country: string;
  code: string;
  cities: string[];
}

interface CountryCitySelectorProps {
  country: string;
  city: string;
  onCountryChange: (country: string) => void;
  onCityChange: (city: string) => void;
}

export default function CountryCitySelector({
  country,
  city,
  onCountryChange,
  onCityChange,
}: CountryCitySelectorProps) {
  const [isCountryOpen, setIsCountryOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsCountryOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get selected country data
  const selectedCountryObj = countriesData.find(
    (c) => c.country.toLowerCase() === country.toLowerCase()
  );

  const availableCities = selectedCountryObj?.cities || [];

  // Filter countries by search term
  const filteredCountries = countriesData.filter((c) =>
    c.country.toLowerCase().includes(countrySearch.toLowerCase()) ||
    c.code.toLowerCase().includes(countrySearch.toLowerCase())
  );

  const handleSelectCountry = (cName: string) => {
    onCountryChange(cName);
    onCityChange(''); // Reset city on country change
    setIsCountryOpen(false);
    setCountrySearch('');
  };

  return (
    <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
      {/* ── 1. Country Dropdown (195 countries with fast search) ──────────────── */}
      <div className="w-full md:w-56 relative" ref={dropdownRef}>
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-secondary mb-2">
          Country (195 World)
        </label>

        {/* Trigger Button */}
        <button
          type="button"
          onClick={() => setIsCountryOpen((prev) => !prev)}
          className="w-full h-10 px-3 py-2 bg-surface border border-outline-variant rounded-xl text-[14px] text-on-surface flex items-center justify-between focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-left"
        >
          <span className="truncate font-medium">
            {country || 'All Countries'}
          </span>
          <span className="material-symbols-outlined text-secondary text-[18px] shrink-0 ml-1">
            {isCountryOpen ? 'expand_less' : 'expand_more'}
          </span>
        </button>

        {/* Searchable Dropdown Popover */}
        {isCountryOpen && (
          <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-outline-variant rounded-2xl shadow-xl p-2 flex flex-col max-h-72 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
            {/* Search Input */}
            <div className="relative mb-2 shrink-0">
              <span className="material-symbols-outlined absolute left-2.5 top-2 text-gray-400 text-[16px]">
                search
              </span>
              <input
                type="text"
                value={countrySearch}
                onChange={(e) => setCountrySearch(e.target.value)}
                placeholder="Type to search country..."
                className="w-full h-8 pl-8 pr-3 text-[13px] bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-primary focus:bg-white"
                autoFocus
              />
            </div>

            {/* Country List */}
            <div className="overflow-y-auto custom-scrollbar flex-1 space-y-0.5 pr-0.5">
              {/* All Countries Option */}
              <button
                type="button"
                onClick={() => handleSelectCountry('All Countries')}
                className={`w-full px-3 py-1.5 text-left text-[13px] rounded-lg transition-colors flex items-center justify-between ${
                  country === 'All Countries'
                    ? 'bg-primary/10 text-primary font-bold'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span>🌍 All Countries</span>
                {country === 'All Countries' && (
                  <span className="material-symbols-outlined text-[15px] text-primary">check</span>
                )}
              </button>

              {filteredCountries.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => handleSelectCountry(c.country)}
                  className={`w-full px-3 py-1.5 text-left text-[13px] rounded-lg transition-colors flex items-center justify-between ${
                    country.toLowerCase() === c.country.toLowerCase()
                      ? 'bg-primary/10 text-primary font-bold'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-mono text-[11px] px-1 py-0.5 bg-gray-100 rounded text-gray-500 uppercase shrink-0">
                      {c.code}
                    </span>
                    <span className="truncate">{c.country}</span>
                  </div>
                  {country.toLowerCase() === c.country.toLowerCase() && (
                    <span className="material-symbols-outlined text-[15px] text-primary shrink-0">
                      check
                    </span>
                  )}
                </button>
              ))}

              {filteredCountries.length === 0 && (
                <div className="py-4 text-center text-[12px] text-gray-400">
                  No matching country found
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── 2. Optional Region / City Dropdown ───────────────────────────────── */}
      {country && country !== 'All Countries' && availableCities.length > 0 && (
        <div className="w-full md:w-48 animate-in fade-in duration-200">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-secondary mb-2">
            Region / City <span className="normal-case font-normal text-gray-400">(optional)</span>
          </label>
          <div className="relative">
            <select
              value={city}
              onChange={(e) => onCityChange(e.target.value)}
              className="w-full h-10 px-3 py-2 bg-surface border border-outline-variant rounded-xl text-[14px] text-on-surface appearance-none focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
            >
              <option value="">All Cities / Regions</option>
              {availableCities.map((cityName) => (
                <option key={cityName} value={cityName}>
                  📍 {cityName}
                </option>
              ))}
            </select>
            <span className="material-symbols-outlined absolute right-3 top-2.5 text-secondary pointer-events-none text-[18px]">
              expand_more
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
