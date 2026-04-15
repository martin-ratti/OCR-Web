interface MascotIconProps {
  className?: string;
}

export const PandaIcon = ({ className = "w-12 h-12" }: MascotIconProps) => (
  <svg 
    viewBox="0 0 100 100" 
    className={className}
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Ears */}
    <circle cx="28" cy="28" r="14" fill="#333" />
    <circle cx="72" cy="28" r="14" fill="#333" />
    {/* Face */}
    <circle cx="50" cy="55" r="40" fill="white" stroke="#333" strokeWidth="3" />
    {/* Eye Patches */}
    <ellipse cx="35" cy="52" rx="10" ry="12" fill="#333" />
    <ellipse cx="65" cy="52" rx="10" ry="12" fill="#333" />
    {/* Eyes */}
    <circle cx="35" cy="52" r="3" fill="white" />
    <circle cx="65" cy="52" r="3" fill="white" />
    {/* Nose */}
    <path d="M47 65 Q50 68 53 65" stroke="#333" strokeWidth="2" fill="none" />
    {/* Cheeks */}
    <circle cx="22" cy="62" r="5" fill="#FFD1DC" />
    <circle cx="78" cy="62" r="5" fill="#FFD1DC" />
  </svg>
);

export const MonkeyIcon = ({ className = "w-12 h-12" }: MascotIconProps) => (
  <svg 
    viewBox="0 0 100 100" 
    className={className}
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Ears */}
    <circle cx="15" cy="50" r="12" fill="#8B4513" />
    <circle cx="85" cy="50" r="12" fill="#8B4513" />
    <circle cx="15" cy="50" r="7" fill="#DEB887" />
    <circle cx="85" cy="50" r="7" fill="#DEB887" />
    {/* Face Shape */}
    <circle cx="50" cy="50" r="40" fill="#8B4513" />
    <path d="M50 85 C25 85 20 60 20 50 C20 40 35 30 50 45 C65 30 80 40 80 50 C80 60 75 85 50 85Z" fill="#F5DEB3" />
    {/* Eyes */}
    <circle cx="40" cy="52" r="4" fill="#333" />
    <circle cx="60" cy="52" r="4" fill="#333" />
    {/* Smile */}
    <path d="M42 68 Q50 72 58 68" stroke="#333" strokeWidth="2" fill="none" />
    {/* Nose dots */}
    <circle cx="47" cy="62" r="1.5" fill="#333" opacity="0.4" />
    <circle cx="53" cy="62" r="1.5" fill="#333" opacity="0.4" />
  </svg>
);

export const BearIcon = ({ className = "w-12 h-12" }: MascotIconProps) => (
  <svg 
    viewBox="0 0 100 100" 
    className={className}
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Ears */}
    <circle cx="25" cy="25" r="12" fill="#964B00" />
    <circle cx="75" cy="25" r="12" fill="#964B00" />
    {/* Face */}
    <circle cx="50" cy="55" r="40" fill="#964B00" />
    {/* Snout */}
    <circle cx="50" cy="68" r="15" fill="#F5DEB3" />
    <ellipse cx="50" cy="62" rx="5" ry="3" fill="#333" />
    {/* Eyes */}
    <circle cx="35" cy="52" r="4" fill="#333" />
    <circle cx="65" cy="52" r="4" fill="#333" />
    {/* Cheeks */}
    <circle cx="22" cy="62" r="5" fill="#D32F2F" opacity="0.2" />
    <circle cx="78" cy="62" r="5" fill="#D32F2F" opacity="0.2" />
  </svg>
);
