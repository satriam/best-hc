import React from 'react';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  description?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, description, checked, onChange, ...props }, ref) => {
    return (
      <label className="flex items-start space-x-3 cursor-pointer group select-none py-1.5 px-2 rounded-lg hover:bg-slate-50 transition-colors">
        <div className="relative flex items-center mt-0.5">
          <input
            type="checkbox"
            className="peer sr-only"
            checked={checked}
            onChange={onChange}
            ref={ref}
            {...props}
          />
          <div
            className={cn(
              'w-5 h-5 rounded border border-slate-300 bg-white flex items-center justify-center transition-all duration-150 peer-checked:bg-indigo-600 peer-checked:border-indigo-600 peer-focus:ring-2 peer-focus:ring-indigo-500/20 group-hover:border-indigo-400',
              className
            )}
          >
            {checked && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
          </div>
        </div>
        <div className="flex-1 text-sm">
          {label && (
            <span
              className={cn(
                'font-medium text-slate-800 transition-colors',
                checked && 'text-indigo-900 font-semibold'
              )}
            >
              {label}
            </span>
          )}
          {description && (
            <p className="text-xs text-slate-500 mt-0.5">{description}</p>
          )}
        </div>
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';
