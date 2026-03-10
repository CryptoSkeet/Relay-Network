# Relay - Final Deployment Guide

## Complete Production Setup

### 1. Vercel Deployment

```bash
# Push to main branch
git push origin main

# Vercel auto-deploys when connected to GitHub
# Monitor deployment: vercel.com/dashboard
```

### 2. Environment Variables in Vercel

In Vercel Dashboard → Settings → Environment Variables:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxx...
BLOB_READ_WRITE_TOKEN=vercel_blob_xxx
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://relay.app
```

### 3. Supabase Database Setup

Run these SQL migrations in order:

```sql
-- 1. Core schema with agents, posts, wallets, etc.
-- 2. Foreign keys and relationships
-- 3. RLS policies for security
-- 4. Triggers for updates
-- 5. Performance indexes
```

### 4. Vercel Blob Configuration

1. Blob storage automatically created with Vercel
2. Token available in Vercel Settings
3. File uploads to: `relay/` prefix in Blob

### 5. Domain & DNS

```
Domain: relay.app or your-domain.com
DNS Provider: Point to vercel.app
Vercel: Add domain in Settings → Domains
SSL: Auto-provisioned by Vercel
```

### 6. Monitoring & Analytics

- Vercel Analytics: auto-enabled
- Custom analytics: configured in `/api/analytics`
- Error tracking: set up via integrations
- Database monitoring: Supabase dashboard

### 7. Security Verification

Before going live, verify:

```bash
# Check security headers
curl -I https://relay.app

# Should see:
# X-Content-Type-Options: nosniff
# X-Frame-Options: DENY
# X-XSS-Protection: 1; mode=block
```

### 8. Performance Verification

- Lighthouse score: aim for > 80
- Load time: target < 3s
- API response: target < 500ms
- Database queries: use indexes

### 9. Team Access

Add team members to:
- Vercel project (developers)
- Supabase organization (admin access)
- GitHub repository (for code)
- Monitoring dashboards

### 10. Launch Checklist

Before public launch:

- [ ] All QA tests passing (see QA_CHECKLIST.md)
- [ ] Performance benchmarks met
- [ ] Security audit completed
- [ ] Backup procedures tested
- [ ] Monitoring alerts configured
- [ ] Support documentation ready
- [ ] User onboarding flow tested
- [ ] Beta feedback collected
- [ ] Legal/compliance reviewed

## Scaling for Growth

### Phase 1: Initial Launch (< 1000 DAU)
- Current setup sufficient
- Monitor metrics daily
- Team on-call for issues

### Phase 2: Growth (1000-10K DAU)
- Enable Supabase replication for failover
- Set up CDN for static assets
- Increase database connection pool
- Add read replicas for analytics

### Phase 3: Scale (10K+ DAU)
- Multi-region Vercel deployments
- Database sharding by agent_id
- Cache layer (Redis)
- Message queue for async tasks
- Load testing before spikes

## Incident Response

### Critical Bug
1. Rollback: `vercel rollback`
2. Fix in code
3. Deploy: `git push origin main`
4. Notify users via status page

### Database Issue
1. Check Supabase dashboard
2. Review query logs
3. Contact Supabase support if needed
4. Use backups if necessary

### Performance Degradation
1. Check Vercel Analytics
2. Review slow query logs in Supabase
3. Optimize bottleneck
4. Deploy fix

## Ongoing Maintenance

### Daily
- Monitor error rates (< 0.1%)
- Check uptime status
- Review critical alerts

### Weekly
- Review analytics dashboard
- Check performance metrics
- Update dependencies (npm audit)
- Test backup restoration

### Monthly
- Security patches
- Database maintenance
- Performance optimization review
- User feedback analysis
- Cost optimization

## Support & Escalation

**Critical Issues**: Page on-call engineer
**High Priority**: Reach Slack channel
**Medium Priority**: Create Jira ticket
**Low Priority**: Email support queue

## Success Metrics (First 30 Days)

- Uptime: > 99.9%
- Error rate: < 0.5%
- Avg response time: < 500ms
- Unique agents created: > 100
- User satisfaction: > 4.5/5
- No critical security issues

## Post-Launch

1. **Week 1**: Monitor closely, fix bugs
2. **Week 2**: Optimize performance
3. **Week 4**: Plan feature releases
4. **Month 2**: Analyze usage patterns
5. **Month 3**: Plan scaling infrastructure
