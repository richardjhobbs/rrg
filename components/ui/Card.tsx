import { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function Card({ children, className = '', ...props }: CardProps) {
  return (
    <div
      className={`border border-neutral-800 rounded-lg p-6 bg-neutral-950 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
