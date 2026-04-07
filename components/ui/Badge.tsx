type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'pro';

const variants: Record<BadgeVariant, string> = {
  default: 'bg-neutral-800 text-neutral-300',
  success: 'bg-green-900/50 text-green-400 border-green-800',
  warning: 'bg-yellow-900/50 text-yellow-400 border-yellow-800',
  danger: 'bg-red-900/50 text-red-400 border-red-800',
  info: 'bg-blue-900/50 text-blue-400 border-blue-800',
  pro: 'bg-purple-900/50 text-purple-400 border-purple-800',
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
}

export function Badge({ children, variant = 'default' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${variants[variant]}`}
    >
      {children}
    </span>
  );
}
