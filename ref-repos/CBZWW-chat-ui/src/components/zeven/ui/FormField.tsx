import * as React from 'react'
import { cn } from '@/lib/cn'
import { Label } from '@/components/zeven/typography/Label'
import { Input, type InputProps } from '@/components/zeven/ui/Input'

export interface FormFieldProps extends InputProps {
  label: string
  fieldClassName?: string
}

const FormField = React.forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, fieldClassName, className, ...inputProps }, ref) => (
    <div className={cn('space-y-2', fieldClassName)}>
      <Label>{label}</Label>
      <Input ref={ref} className={className} {...inputProps} />
    </div>
  )
)
FormField.displayName = 'FormField'

export { FormField }
