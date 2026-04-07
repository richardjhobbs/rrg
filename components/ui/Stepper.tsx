'use client';

interface StepperProps {
  steps: string[];
  currentStep: number;
}

export function Stepper({ steps, currentStep }: StepperProps) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div
            className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors ${
              i < currentStep
                ? 'bg-green-500 text-black'
                : i === currentStep
                  ? 'bg-neutral-700 text-white ring-2 ring-green-500/50'
                  : 'bg-neutral-900 text-neutral-600'
            }`}
          >
            {i < currentStep ? '\u2713' : i + 1}
          </div>
          <span
            className={`text-sm hidden sm:inline ${
              i < currentStep ? 'text-green-400' : i === currentStep ? 'text-neutral-300' : 'text-neutral-600'
            }`}
          >
            {label}
          </span>
          {i < steps.length - 1 && (
            <div
              className={`w-8 h-px ${
                i < currentStep ? 'bg-green-500/50' : 'bg-neutral-800'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
