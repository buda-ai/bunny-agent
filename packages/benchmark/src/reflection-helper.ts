/**
 * Reflection Helper - Triggers reflection prompts during task execution
 * Implements prompt-based reflection to improve agent performance
 */

/**
 * Check if reflection should be triggered based on context
 */
export function shouldTriggerReflection(context: {
  stepCount: number;
  maxSteps: number;
  lastCommand?: string;
  commandHistory: string[];
  hasError?: boolean;
}): boolean {
  const { stepCount, maxSteps, lastCommand, commandHistory, hasError } =
    context;

  // Always reflect if there was an error
  if (hasError) {
    return true;
  }

  // Reflect at key milestones (every 3 steps, but not too early)
  if (stepCount > 2 && stepCount % 3 === 0) {
    return true;
  }

  // Reflect if approaching step limit (80% of max steps)
  if (stepCount >= maxSteps * 0.8) {
    return true;
  }

  // Reflect if same command used consecutively 3+ times
  if (lastCommand && commandHistory.length >= 3) {
    const recent = commandHistory.slice(-3);
    if (recent.every((cmd) => cmd === lastCommand)) {
      return true;
    }
  }

  return false;
}

/**
 * Reflection prompt templates
 */
export const REFLECTION_PROMPTS = {
  basic: `
🤔 **QUICK CHECK**

Take 10 seconds to assess your progress:

1. What did you just learn? (1 sentence)
2. Are you closer to the answer? (yes/no + why)
3. What's your IMMEDIATE next action? (be specific: which tool + what query)

Then DO IT - take that action right now!
`,

  detailed: `
🤔 **PROGRESS CHECK**

**What you learned:** Summarize the key information from the last tool.

**Progress status:**
- Moving toward answer? (yes/no)
- Confidence level? (low/medium/high)
- Any contradictions or gaps?

**Immediate next action:**
Choose ONE and execute immediately:
1. Search with different query
2. Verify with another tool
3. Calculate or process data
4. Provide final answer (if confident)

DO IT NOW - don't just plan!
`,

  quick: `
🤔 Quick check: What did you learn? Helpful? Next tool? → GO!
`,

  error: `
⚠️ **ERROR OCCURRED**

An error just happened. Before continuing:

1. What went wrong? (1 sentence)
2. Why did it fail? (identify root cause)
3. What's your alternative approach? (be specific)

Now try the alternative immediately!
`,

  approaching_limit: `
⏰ **APPROACHING STEP LIMIT**

You're running out of steps. Focus:

1. Do you have enough info to answer? (yes/no)
2. If yes: Formulate the answer NOW
3. If no: What's the ONE critical piece missing? Get it NOW!

Time is limited - act decisively!
`,

  stuck: `
🔄 **POSSIBLE LOOP DETECTED**

You seem to be repeating the same action. Break the pattern:

1. What have you tried? (quick list)
2. What HASN'T worked?
3. What's a DIFFERENT approach you haven't tried?

Switch tactics NOW!
`,
};

/**
 * Build reflection prompt based on context
 */
export function buildReflectionPrompt(
  stepContext: {
    stepNumber: number;
    totalSteps: number;
    lastCommand?: string;
    hasError?: boolean;
    isRepeating?: boolean;
  },
  reflectionStyle: "basic" | "detailed" | "quick" = "basic",
): string {
  const { stepNumber, totalSteps, lastCommand, hasError, isRepeating } =
    stepContext;

  let prompt = `\n${"=".repeat(60)}\n`;
  prompt += `📊 Step ${stepNumber} of ${totalSteps} completed\n`;
  if (lastCommand) {
    prompt += `🔧 Last command: ${lastCommand}\n`;
  }
  prompt += "=".repeat(60) + "\n";

  // Choose appropriate prompt based on context
  if (hasError) {
    prompt += REFLECTION_PROMPTS.error;
  } else if (isRepeating) {
    prompt += REFLECTION_PROMPTS.stuck;
  } else if (stepNumber >= totalSteps * 0.8) {
    prompt += REFLECTION_PROMPTS.approaching_limit;
  } else {
    prompt += REFLECTION_PROMPTS[reflectionStyle];
  }

  return prompt;
}

/**
 * Extract command name from raw output for reflection tracking
 */
export function extractCommandFromOutput(output: string): string | undefined {
  // Try to extract command from common patterns
  const patterns = [
    /Executing command: ([^\n]+)/i,
    /Running: ([^\n]+)/i,
    /Command: ([^\n]+)/i,
    /\$ ([^\n]+)/,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match?.[1]) {
      return match[1].trim().split(" ")[0]; // Get just the command name
    }
  }

  return undefined;
}

/**
 * Check if output contains final answer indicators
 */
export function containsFinalAnswer(text: string): boolean {
  const indicators = [
    /FINAL\s+ANSWER:/i,
    /final answer/i,
    /task complete/i,
    /conclusion:/i,
    /therefore,?\s+(?:the answer is|it is)/i,
    /in summary/i,
    /\*\*(?:Final\s+)?Answer:\*\*/i,
  ];

  return indicators.some((pattern) => pattern.test(text));
}
