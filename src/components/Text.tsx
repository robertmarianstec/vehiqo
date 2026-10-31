import { Text as RNText, TextProps } from 'react-native';

type TextVariant =
  | 'hero'
  | 'display'
  | 'heading'
  | 'label'
  | 'body'
  | 'caption'
  | 'eyebrow'
  | 'timestamp';

interface AppTextProps extends TextProps {
  variant?: TextVariant;
  tone?: 'primary' | 'muted' | 'info' | 'warning' | 'danger';
  children: React.ReactNode;
}

const variantClasses: Record<TextVariant, string> = {
  hero: 'text-hero font-bold tracking-tight',
  display: 'text-4xl font-bold',
  heading: 'text-2xl font-bold',
  label: 'text-lg font-semibold',
  body: 'text-base',
  caption: 'text-sm',
  eyebrow: 'text-sm font-extrabold uppercase tracking-wide',
  timestamp: 'text-xs',
};

const toneClasses = {
  primary: 'text-ink',
  muted: 'text-ink-muted',
  info: 'text-info-ink',
  warning: 'text-warning-ink',
  danger: 'text-danger-ink',
};

export function Text({
  variant = 'body',
  tone,
  className,
  children,
  ...props
}: AppTextProps) {
  const secondary =
    variant === 'caption' || variant === 'eyebrow' || variant === 'timestamp';
  const color = toneClasses[tone ?? (secondary ? 'muted' : 'primary')];
  return (
    <RNText
      className={`${color} ${variantClasses[variant]} ${className ?? ''}`}
      {...props}
    >
      {children}
    </RNText>
  );
}
