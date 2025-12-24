# Skill: Code Review

## Purpose
Perform thorough code reviews to identify issues and suggest improvements.

## When to Use
- User asks for code review
- Before merging changes
- When refactoring code

## Review Checklist

### Functionality
- [ ] Code does what it's supposed to do
- [ ] Edge cases are handled
- [ ] Error handling is appropriate

### Readability
- [ ] Clear naming conventions
- [ ] Consistent formatting
- [ ] Appropriate comments

### Performance
- [ ] No obvious inefficiencies
- [ ] Appropriate data structures
- [ ] No memory leaks

### Security
- [ ] Input validation present
- [ ] No hardcoded secrets
- [ ] Secure by default

### Testing
- [ ] Tests cover new code
- [ ] Tests are meaningful
- [ ] No flaky tests

## Review Template

```markdown
## Code Review Summary

### Overview
[Brief description of what the code does]

### Strengths
- [List what's good about the code]

### Issues Found
1. **[Severity]**: [Description]
   - Location: [file:line]
   - Suggestion: [How to fix]

### Suggestions
- [Optional improvements]

### Verdict
[APPROVE / REQUEST CHANGES / NEEDS DISCUSSION]
```
