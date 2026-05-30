/**
 * Multi-Step Form Wizard Component (CF-WC-095)
 *
 * Stepped form with progress indicator, back/next navigation, and validation.
 */

'use client';

import { useState, ReactNode } from 'react';

export interface WizardStep {
  id: string;
  title: string;
  description?: string;
  content: ReactNode;
  validate?: () => Promise<boolean> | boolean;
}

export interface FormWizardProps {
  steps: WizardStep[];
  onComplete?: () => void;
  className?: string;
}

export function FormWizard({
  steps,
  onComplete,
  className = '',
}: FormWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const currentStepData = steps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;

  const handleNext = async () => {
    setValidationError(null);

    // Run validation if provided
    if (currentStepData.validate) {
      setIsValidating(true);
      try {
        const isValid = await currentStepData.validate();
        setIsValidating(false);

        if (!isValid) {
          setValidationError('Please complete all required fields');
          return;
        }
      } catch (error) {
        setIsValidating(false);
        setValidationError(
          error instanceof Error ? error.message : 'Validation failed'
        );
        return;
      }
    }

    // Mark current step as completed
    setCompletedSteps((prev) => new Set([...prev, currentStep]));

    // Move to next step or complete
    if (isLastStep) {
      onComplete?.();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (!isFirstStep) {
      setValidationError(null);
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleStepClick = (stepIndex: number) => {
    // Only allow clicking on completed steps or the next immediate step
    if (
      completedSteps.has(stepIndex) ||
      stepIndex === currentStep ||
      (stepIndex === currentStep + 1 && completedSteps.has(currentStep))
    ) {
      setValidationError(null);
      setCurrentStep(stepIndex);
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Progress Steps */}
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = completedSteps.has(index);
          const isCurrent = index === currentStep;
          const isClickable =
            isCompleted ||
            isCurrent ||
            (index === currentStep + 1 && completedSteps.has(currentStep));

          return (
            <div key={step.id} className="flex items-center flex-1">
              {/* Step Indicator */}
              <button
                onClick={() => handleStepClick(index)}
                disabled={!isClickable}
                className={`
                  relative flex flex-col items-center transition-all
                  ${isClickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}
                `}
                aria-label={`Step ${index + 1}: ${step.title}`}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <div
                  className={`
                    w-10 h-10 rounded-full flex items-center justify-center
                    font-semibold text-sm transition-colors border-2
                    ${
                      isCurrent
                        ? 'bg-blue-500 text-white border-blue-500'
                        : isCompleted
                        ? 'bg-green-500 text-white border-green-500'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600'
                    }
                  `}
                >
                  {isCompleted ? '✓' : index + 1}
                </div>
                <div className="mt-2 text-xs font-medium text-gray-700 dark:text-gray-300 text-center max-w-[100px]">
                  {step.title}
                </div>
              </button>

              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div
                  className={`
                    flex-1 h-0.5 mx-2 transition-colors
                    ${
                      completedSteps.has(index)
                        ? 'bg-green-500'
                        : 'bg-gray-300 dark:bg-gray-700'
                    }
                  `}
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {currentStepData.title}
          </h2>
          {currentStepData.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {currentStepData.description}
            </p>
          )}
        </div>

        <div className="min-h-[200px]">{currentStepData.content}</div>

        {/* Validation Error */}
        {validationError && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-400">
            {validationError}
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleBack}
          disabled={isFirstStep}
          className={`
            px-4 py-2 rounded font-medium transition-colors
            ${
              isFirstStep
                ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
            }
          `}
          aria-label="Previous step"
        >
          ← Back
        </button>

        <div className="text-sm text-gray-600 dark:text-gray-400">
          Step {currentStep + 1} of {steps.length}
        </div>

        <button
          onClick={handleNext}
          disabled={isValidating}
          className={`
            px-4 py-2 rounded font-medium transition-colors
            ${
              isValidating
                ? 'bg-gray-400 cursor-wait'
                : 'bg-blue-500 hover:bg-blue-600'
            }
            text-white
          `}
          aria-label={isLastStep ? 'Complete wizard' : 'Next step'}
        >
          {isValidating ? (
            <span className="flex items-center">
              <span className="animate-spin mr-2">⟳</span>
              Validating...
            </span>
          ) : isLastStep ? (
            'Complete'
          ) : (
            'Next →'
          )}
        </button>
      </div>
    </div>
  );
}

// Example usage component
export function ExampleWizard() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    preferences: '',
  });

  const steps: WizardStep[] = [
    {
      id: 'personal',
      title: 'Personal Info',
      description: 'Tell us about yourself',
      content: (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              placeholder="Enter your name"
            />
          </div>
        </div>
      ),
      validate: async () => {
        return formData.name.trim().length > 0;
      },
    },
    {
      id: 'contact',
      title: 'Contact',
      description: 'How can we reach you?',
      content: (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, email: e.target.value }))
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              placeholder="your@email.com"
            />
          </div>
        </div>
      ),
      validate: async () => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email);
      },
    },
    {
      id: 'preferences',
      title: 'Preferences',
      description: 'Customize your experience',
      content: (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Preferences
            </label>
            <textarea
              value={formData.preferences}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, preferences: e.target.value }))
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              rows={4}
              placeholder="Tell us your preferences..."
            />
          </div>
        </div>
      ),
    },
  ];

  return (
    <FormWizard
      steps={steps}
      onComplete={() => {
        console.log('Wizard completed with data:', formData);
      }}
    />
  );
}
