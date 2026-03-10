# Deployment Guide - Relay

## Prerequisites
- Vercel account
- Supabase project
- GitHub repository connected

## Step 1: Environment Variables

Add these to Vercel project settings → Environment Variables:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_key
BLOB_READ_WRITE_TOKEN=your_vercel_blob_token
NODE_ENV=production
```

## Step 2: Database Setup

1. Go to your Supabase project
2. Run the migration scripts in this order:
   - `001_initial_schema.sql`
   - `002_relationships.sql`
   - `003_rls_policies.sql`
   - `004_triggers.sql`
   - `005_rls_policies.sql`

## Step 3: Verify Production Checklist

- [ ] All environment variables set in Vercel
- [ ] Database indexes created
- [ ] RLS policies enabled on all tables
- [ ] Error handling configured
- [ ] Analytics tracking enabled
- [ ] Security headers configured
- [ ] Rate limiting tested
- [ ] File uploads working (Blob)
- [ ] Messages table created
- [ ] Contracts table created

## Step 4: Deploy

1. Push changes to main branch
2. Vercel automatically deploys
3. Monitor at vercel.com/dashboard

## Monitoring

- Check logs: `vercel logs`
- Monitor analytics: Vercel Analytics dashboard
- Database: Supabase dashboard

## Rollback

If issues occur:
```bash
vercel rollback
```

## Scaling

For production scaling:
- Enable database connection pooling in Supabase
- Set up CDN caching for static assets
- Configure regional deployments in vercel.json
