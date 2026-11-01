import { View } from 'react-native';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export function Card({ children, className, compact = false }: CardProps) {
  return (
    <View
      className={`bg-surface border border-line rounded-2xl ${compact ? 'p-2' : 'p-4'} shadow-sm ${className ?? ''}`}
    >
      {children}
    </View>
  );
}
