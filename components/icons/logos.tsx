import React from 'react';

/**
 * High-fidelity vector logos for Aguka AI WhatsApp Platform
 * Follows designer-grade SVG specs without emojis
 */

export function WhatsAppLogo({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982 1-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.888 9.885m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c-.001 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.455 5.71 1.456h.005c6.554 0 11.89-5.336 11.893-11.893a11.82 11.82 0 00-3.48-8.413z"
        fill="#25D366"
      />
    </svg>
  );
}

export function MetaLogo({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.04c-5.5 0-10 4.49-10 10.02 0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.23.19 2.23.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33v7a10 10 0 0 0 8.44-9.9c0-5.53-4.5-10.02-10-10.02z" />
    </svg>
  );
}

export function RwandaFlagIcon({ className = 'w-4 h-3' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="8" fill="#00A1DE" />
      <rect y="8" width="24" height="4" fill="#FAD201" />
      <rect y="12" width="24" height="4" fill="#20603D" />
      <circle cx="19.5" cy="4" r="2" fill="#EAAA00" />
    </svg>
  );
}

export function RwandaGovernmentLogo({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" stroke="#00A1DE" strokeWidth="1.5" />
      <path d="M12 5V9M12 15V19M5 12H9M15 12H19" stroke="#FAD201" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3.5" fill="#20603D" />
      <circle cx="12" cy="12" r="1.5" fill="#FAD201" />
    </svg>
  );
}

export function PostgresLogo({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 16.93V18h-2v.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v.93zm5.79-4.72c-.41.43-.91.77-1.46 1.01L15 13.5V11c0-.55-.45-1-1-1h-2V8h2c1.1 0 2-.9 2-2V4.46c2.81 1.37 4.8 4.14 4.98 7.47-.06.77-.24 1.52-.51 2.22z"/>
    </svg>
  );
}

export function RedisLogo({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.41 6.58l-6.42-3.71a1.99 1.99 0 00-1.98 0L4.59 6.58a2 2 0 00-1 1.73v7.38c0 .72.39 1.38 1 1.73l6.42 3.71c.61.35 1.37.35 1.98 0l6.42-3.71c.61-.35 1-1.01 1-1.73V8.31c0-.72-.39-1.38-1-1.73zM12 4.47l6 3.46-2.5 1.44-6-3.46 2.5-1.44zm-7 4.72l6 3.46v2.88l-6-3.46V9.19zm8 9.8l-6-3.46 2.5-1.44 6 3.46-2.5 1.44zm1-3.46v-2.88l6-3.46v2.88l-6 3.46z"/>
    </svg>
  );
}

export function TypeScriptLogo({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect width="24" height="24" rx="4" fill="#3178C6" />
      <path d="M11.5 14.5v-7h-2V6h5.5v1.5h-2v7h-1.5zm8-1.2c-.3.8-.9 1.4-1.8 1.4-1.2 0-2-.9-2-2.3 0-1.5.8-2.4 2.1-2.4.9 0 1.5.5 1.7 1.2l-1.3.5c-.1-.3-.4-.5-.7-.5-.5 0-.8.4-.8 1.2 0 .7.3 1.2.8 1.2.4 0 .6-.2.8-.5l1.2.7z" fill="white" />
    </svg>
  );
}

export function PythonLogo({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.9 2c-3.1 0-5.1 1.3-5.1 3.5v2.6h5.2v.7H4.4C2.3 8.8 1 10.7 1 13.5c0 2.9 1.4 4.7 3.5 4.7h2.2v-2.4c0-2.3 1.9-4.2 4.2-4.2h5.1V8.9c0-2.2-2.1-3.5-5.2-3.5h-.9V2h2zm-2.4 1.8c.5 0 .9.4.9.9 0 .5-.4.9-.9.9s-.9-.4-.9-.9c0-.5.4-.9.9-.9zm2.6 18.2c3.1 0 5.1-1.3 5.1-3.5v-2.6H12v-.7h7.6c2.1 0 3.4-1.9 3.4-4.7 0-2.9-1.4-4.7-3.5-4.7h-2.2v2.4c0 2.3-1.9 4.2-4.2 4.2H8v2.7c0 2.2 2.1 3.5 5.2 3.5h.9V22h-2zm2.4-1.8c-.5 0-.9-.4-.9-.9 0-.5.4-.9.9-.9s.9.4.9.9c0 .5-.4.9-.9.9z" fill="#3776AB"/>
    </svg>
  );
}

export function CppLogo({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect width="24" height="24" rx="4" fill="#00599C" />
      <text x="12" y="16" fill="white" fontSize="11" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">C++</text>
    </svg>
  );
}

export function GeminiLogo({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 2L13.8 8.2C14.3 9.7 15.3 10.7 16.8 11.2L23 13L16.8 14.8C15.3 15.3 14.3 16.3 13.8 17.8L12 24L10.2 17.8C9.7 16.3 8.7 15.3 7.2 14.8L1 13L7.2 11.2C8.7 10.7 9.7 9.7 10.2 8.2L12 2Z"
        fill="url(#geminiGradient)"
      />
      <defs>
        <linearGradient id="geminiGradient" x1="1" y1="2" x2="23" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4E82EE" />
          <stop offset="0.5" stopColor="#9C5AF2" />
          <stop offset="1" stopColor="#E26D8E" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function DockerLogo({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M13.98 10.02h2.04v2.04h-2.04zm-2.52 0h2.04v2.04h-2.04zm-2.52 0h2.04v2.04H8.94zm-2.52 0h2.04v2.04H6.42zm7.56-2.52h2.04v2.04h-2.04zm-2.52 0h2.04v2.04h-2.04zm-2.52 0h2.04v2.04H8.94zm5.04-2.52h2.04v2.04h-2.04zm-2.52 0h2.04v2.04h-2.04zM23.5 12.3c-.35-.22-.9-.35-1.47-.3-.15-.75-.62-1.35-1.25-1.65-.25-.12-.52-.18-.8-.18-.38 0-.75.12-1.05.35-.45-.4-.98-.62-1.58-.62h-1.3v3h7.2c.2 0 .38-.1.45-.3.08-.2.02-.45-.2-.55zM1 14.2c.5 3.8 3.8 6.8 7.8 6.8 5.4 0 9.8-3.9 10.2-9.1H1.5c-.3.7-.5 1.5-.5 2.3z" fill="#2496ED" />
    </svg>
  );
}
