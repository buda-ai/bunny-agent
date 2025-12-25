# Skill: Debugging

## Purpose
Systematically identify and fix bugs in code.

## When to Use
- Error messages or exceptions occur
- Unexpected behavior is observed
- Tests are failing

## Debugging Workflow

### 1. Reproduce
- Understand the exact steps to trigger the issue
- Note the expected vs actual behavior
- Gather error messages and stack traces

### 2. Isolate
- Narrow down the problem area
- Create minimal reproduction case
- Check recent changes

### 3. Investigate
- Add logging or print statements
- Use debugger if available
- Check related code paths

### 4. Fix
- Make the smallest possible change
- Ensure fix doesn't break other things
- Add test to prevent regression

### 5. Verify
- Run the reproduction steps
- Run full test suite
- Check edge cases

## Common Debugging Commands

```bash
# Python - run with verbose errors
python -v script.py

# Node.js - inspect
node --inspect script.js

# Check processes
ps aux | grep <process_name>

# Check logs
tail -f /var/log/app.log

# Check open files/ports
lsof -i :8080
```

## Debugging Patterns

### Binary Search
When bug is in a large codebase:
1. Comment out half the code
2. If bug persists, it's in the remaining half
3. Repeat until isolated

### Print Debugging
```python
print(f"DEBUG: variable={variable}, type={type(variable)}")
```

### Rubber Duck Debugging
Explain the code line by line out loud.
