---
name: planning-verification
description: Task planning, decomposition, and answer verification. Use when breaking down complex problems, creating step-by-step plans, or verifying the correctness of solutions.
---

# Planning and Verification Skills

## Task Decomposition

### Breaking Down Complex Tasks

1. **Identify the goal**: What is the final answer supposed to be?
2. **List dependencies**: What information is needed?
3. **Order the steps**: Which steps depend on which?
4. **Estimate complexity**: How many tool calls needed?

### Example Decomposition

**Task**: "What was Apple's stock price on the day Steve Jobs resigned as CEO?"

```
Step 1: Find the date Steve Jobs resigned as CEO
        - Method: Web search
        - Output: Date

Step 2: Get Apple stock price on that date
        - Method: Financial API (yfinance)
        - Input: Date from Step 1
        - Output: Stock price

Step 3: Verify and format answer
        - Check if price needs adjustment for splits
        - Return final price
```

## Verification Strategies

### Cross-Reference Information

```python
# Always verify important facts from multiple sources
sources = []
sources.append(search_source_1())
sources.append(search_source_2())

# Compare results
if all_sources_agree(sources):
    return confirmed_answer
else:
    investigate_discrepancy(sources)
```

### Sanity Checks

- **Numerical bounds**: Is the number reasonable?
- **Date validity**: Is the date in the right range?
- **Type checking**: Is this the right kind of data?
- **Unit verification**: Are units consistent?

### Self-Validation

Before giving a final answer, ask:
1. Did I answer the actual question asked?
2. Is my answer in the correct format?
3. Have I verified the key facts?
4. Are there any assumptions I should state?

## Error Recovery

### When Things Go Wrong

1. **Tool failure**: Try alternative methods
2. **Ambiguous results**: Seek clarification or state assumptions
3. **Conflicting data**: Document the conflict, use most authoritative source
4. **Missing information**: Clearly state what's unknown

### Graceful Degradation

```
If primary method fails:
1. Try backup method
2. If backup fails, explain what was attempted
3. Provide partial answer if possible
4. Be honest about limitations
```

## Best Practices

1. **Plan before acting**: Outline your approach first
2. **Document assumptions**: State any assumptions explicitly
3. **Verify critical data**: Double-check important facts
4. **Show confidence levels**: Indicate certainty in your answer
5. **Admit uncertainty**: It's better to say "I don't know" than guess
