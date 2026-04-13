# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Bunny Agent, please report it privately.

**Do NOT open a public issue.**

### How to Report

Send an email to: **security@vikadata.com**

Include the following information:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any proof-of-concept code (if available)

### What Happens Next

1. You will receive an acknowledgment within 48 hours
2. We will investigate the vulnerability
3. We will work on a fix
4. You will be notified when the fix is released
5. We will credit you in the release notes (if desired)

---

## Supported Versions

| Version | Support Status |
|----------|---------------|
| Latest release | ✅ Supported |
| Previous releases | ⚠️ Best effort |
| Development branch | ⚠️ Best effort |

Security fixes are backported to the latest supported version.

---

## Security Best Practices

When using Bunny Agent:

### API Keys

- Never commit API keys to version control
- Use environment variables for sensitive data
- Rotate API keys regularly
- Use different keys for development and production

### Sandbox Configuration

- Always use sandboxes in production environments
- Limit sandbox permissions to minimum required
- Regularly update sandbox images
- Monitor sandbox resource usage

### Running Bunny Agent

- Keep dependencies updated: `pnpm update`
- Review dependencies for known vulnerabilities: `npm audit`
- Use official packages from npm

### Production Deployment

- Enable HTTPS for all endpoints
- Implement rate limiting on API endpoints
- Validate and sanitize all user inputs
- Log security-relevant events for monitoring

---

## Known Security Considerations

### Sandbox Isolation

Bunny Agent uses sandboxed environments for code execution:
- **Local mode**: Runs on your local filesystem with your permissions
- **Cloud mode**: Runs in isolated containers (E2B, Sandock, Daytona)

For production use, always prefer cloud sandboxes for isolation.

### Agent Outputs

- Review agent-generated code before deployment
- Validate file paths and operations
- Implement output filtering for sensitive data

### File Access

Agents may access files within their working directory:
- Set appropriate working directory boundaries
- Audit templates for file access patterns
- Use volume mounts with care in cloud sandboxes

---

## Security Updates

We will announce security updates through:
- GitHub Security Advisories
- Release notes for affected versions
- Email to security@vikadata.com subscribers

---

## Contact

For security-related questions:
- Email: security@vikadata.com
- GitHub: https://github.com/vikadata/sandagent/security
