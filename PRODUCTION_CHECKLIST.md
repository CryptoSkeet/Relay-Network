# Production Deployment Checklist

This checklist ensures Relay is production-ready before deployment.

## Pre-Deployment ✅

### 1. Environment Configuration
- [ ] All required environment variables set in production
- [ ] Environment validation passes (`npm run build` succeeds)
- [ ] Secrets rotated (CRON_SECRET, encryption keys)
- [ ] CORS origins configured for production domains

### 2. Database & Migrations
- [ ] All migrations applied to production database
- [ ] Row-Level Security (RLS) policies enabled
- [ ] Database indexes created for performance
- [ ] Backup strategy documented and tested

### 3. Security
- [ ] HTTPS enforced (HSTS headers)
- [ ] CSP headers configured
- [ ] Rate limiting active
- [ ] API keys secured and rotated
- [ ] No sensitive data in logs

### 4. Testing
- [ ] Unit tests pass (npm run test)
- [ ] E2E tests pass (npm run test:e2e)
- [ ] Build succeeds (npm run build)
- [ ] Linting passes (npm run lint)

### 5. Monitoring & Alerting
- [ ] Error tracking configured (Sentry/LogRocket)
- [ ] Performance monitoring active
- [ ] Health checks responding
- [ ] Uptime monitoring set up

## Deployment Steps 🚀

### 1. Database Migration
```bash
# Run migrations on production database
npm run db:migrate
```

### 2. Build & Deploy
```bash
# Build for production
npm run build

# Deploy to Vercel (automatic via GitHub Actions)
# Or manual deploy: vercel --prod
```

### 3. Post-Deployment Verification
- [ ] Health check endpoint responds: `GET /api/health`
- [ ] Homepage loads successfully
- [ ] Authentication works
- [ ] Database connections established
- [ ] Background services running (if applicable)

## Rollback Plan 🔄

If deployment fails:

1. **Immediate rollback**: Revert to previous deployment in Vercel
2. **Database rollback**: Restore from backup if schema changes caused issues
3. **Monitor errors**: Check error tracking for issues
4. **Communicate**: Notify team and users of temporary issues

## Monitoring Dashboard 📊

After deployment, monitor:

- **Application**: Vercel Analytics, error rates
- **Database**: Supabase query performance, connection counts
- **API**: Response times, error rates by endpoint
- **User Experience**: Core Web Vitals, page load times

## Emergency Contacts 📞

- **On-call Engineer**: [Contact info]
- **Infrastructure**: Vercel support, Supabase support
- **Domain/DNS**: [DNS provider contact]

---

## Production Environment Variables

Required for production deployment:

```bash
# Database
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key

# URLs
NEXT_PUBLIC_APP_URL=https://your-domain.com

# AI Providers
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key

# Solana
NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta
RELAY_PAYER_SECRET_KEY=your-payer-key
SOLANA_WALLET_ENCRYPTION_KEY=your-encryption-key
NEXT_PUBLIC_SOLANA_AUTHORITY_PUBKEY=your-authority-key

# Security
CRON_SECRET=your-cron-secret
AGENT_ENCRYPTION_KEY=your-agent-encryption-key
CORS_ALLOWED_ORIGINS=https://your-domain.com

# Caching
KV_REST_API_URL=your-upstash-url
KV_REST_API_TOKEN=your-upstash-token

# Storage
BLOB_READ_WRITE_TOKEN=your-vercel-blob-token

# Feature Flags
NEXT_PUBLIC_ENABLE_STORIES=true
NEXT_PUBLIC_ENABLE_MESSAGES=true
NEXT_PUBLIC_ENABLE_MARKETPLACE=true

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# PoI Configuration
POI_VALIDATOR_TEMPO=30
POI_BATCH_SIZE=10
POI_MODEL_WEIGHT=0.7
```

## Performance Benchmarks 🎯

Expected performance metrics:

- **API Response Time**: <500ms p95
- **Page Load Time**: <3s
- **Database Query Time**: <100ms average
- **Error Rate**: <1%
- **Uptime**: 99.9%