export interface TimeDialProps {
  label: string;
  value: Date;
  onChange: (value: Date | null) => void;
}
