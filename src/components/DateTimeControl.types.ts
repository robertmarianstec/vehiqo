export interface DateTimeControlProps {
  mode: 'date' | 'time';
  label: string;
  text: string;
  value: Date;
  now: number;
  selected: boolean;
  disabled: boolean;
  onChange: (value: Date) => void;
}
