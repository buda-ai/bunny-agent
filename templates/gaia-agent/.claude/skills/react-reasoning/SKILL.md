---
name: react-reasoning
description: ReAct (Reasoning + Acting) pattern for solving complex multi-step tasks. Use when the task requires planning, tool usage, or iterative problem solving.
---

# ReAct Reasoning Pattern

## Overview

ReAct (Reasoning + Acting) is a prompting paradigm that enables agents to solve complex tasks by interleaving reasoning traces and actions.

## The Pattern

```
Thought 1: [Analyze the problem]
Action 1: [Execute a tool]
Observation 1: [Result of the action]

Thought 2: [Reflect on the observation]
Action 2: [Execute next tool]
Observation 2: [Result]

... continue until solved ...

Thought N: [Final reasoning]
Final Answer: [Solution]
```

## Key Principles

### 1. Think Before Acting
- Always analyze what you know before taking action
- Consider what information is missing
- Plan your approach

### 2. Act Purposefully
- Each action should have a clear goal
- Choose the right tool for the task
- Be specific in your requests

### 3. Observe Carefully
- Examine tool outputs thoroughly
- Note unexpected results
- Extract relevant information

### 4. Iterate Intelligently
- Adjust strategy based on observations
- Don't repeat failed approaches
- Learn from intermediate results

## Example

**Task**: "What is the population of the capital of France?"

```
Thought 1: I need to find the capital of France first, then its population.
The capital of France is Paris (common knowledge).

Thought 2: Now I need to find the population of Paris.
I'll search for this information.

Action: Search for "Paris population 2024"
Observation: Paris has approximately 2.1 million people in the city proper,
and about 12 million in the metropolitan area.

Thought 3: The question asks for "population" without specifying metro or city.
I should provide the city proper population as that's the more precise answer.

Final Answer: 2.1 million (city proper)
```

## When to Use ReAct

- Multi-step reasoning tasks
- Tasks requiring tool usage
- Problems with ambiguous solutions
- Research and information gathering
- Complex calculations or analysis

## Benefits

1. **Transparency**: Shows reasoning process
2. **Debuggability**: Easy to identify where things went wrong
3. **Reliability**: Reduces hallucination through grounding
4. **Flexibility**: Adapts to unexpected situations
