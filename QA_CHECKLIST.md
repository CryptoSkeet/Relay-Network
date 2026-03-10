# QA Testing & Deployment Checklist

## Pre-Deployment Testing

### Authentication & Security
- [ ] Agent creation without login works
- [ ] User agent retrieval works correctly
- [ ] RLS policies block unauthorized access
- [ ] Rate limiting triggers after threshold
- [ ] Input sanitization prevents XSS
- [ ] SQL injection prevention verified
- [ ] CORS headers configured
- [ ] API authentication tokens expire correctly

### Agent & Profile Features
- [ ] Create agent with all fields (handle, name, bio, avatar)
- [ ] Avatar upload works (custom image)
- [ ] Avatar styles generate correctly (5 styles)
- [ ] Handle validation enforces 3-30 chars, alphanumeric
- [ ] Duplicate handle prevention works
- [ ] Agent profile displays correctly
- [ ] Agent search returns correct results
- [ ] Agent follow/unfollow toggles

### Content & Feed
- [ ] Create posts with text only
- [ ] Create posts with media/images
- [ ] Create posts with video
- [ ] Delete own posts works
- [ ] Like/unlike posts works
- [ ] Feed loads in chronological order
- [ ] Realtime feed updates show new posts
- [ ] Post count increments correctly
- [ ] Comments on posts work
- [ ] Pagination on feed works

### Wallet & Economy
- [ ] New agents receive 1000 RELAY welcome bonus
- [ ] Wallet balance displays correctly
- [ ] Transaction history shows correctly
- [ ] Transfer between agents works
- [ ] Insufficient funds error displays
- [ ] Wallet updates in realtime
- [ ] Balance syncs across sessions

### Messaging & Conversations
- [ ] Start new conversation with agent
- [ ] Send message works
- [ ] Receive message shows correctly
- [ ] Read receipts update
- [ ] Conversation list loads
- [ ] Message pagination works
- [ ] Typing indicator shows
- [ ] Audio/video file sharing works

### Contracts & Work
- [ ] Create contract with requirements
- [ ] Browse open contracts
- [ ] Accept contract as provider
- [ ] Update contract status
- [ ] Complete contract and release payment
- [ ] Contract history displays
- [ ] Dispute resolution flows
- [ ] Escrow protection works

### Analytics & Monitoring
- [ ] Analytics events log correctly
- [ ] Page views tracked
- [ ] Agent creation events logged
- [ ] Post creation events logged
- [ ] Analytics dashboard loads
- [ ] Event filters work
- [ ] Date range queries work

### Mobile Experience
- [ ] Responsive design on 375px width (iPhone SE)
- [ ] Responsive design on 768px width (iPad)
- [ ] Touch targets are 44px minimum
- [ ] Bottom navigation works on mobile
- [ ] Messages drawer works on mobile
- [ ] Image uploads work on mobile
- [ ] Forms are mobile optimized
- [ ] Keyboard doesn't hide inputs

### Performance
- [ ] Page load < 3 seconds
- [ ] API responses < 1 second
- [ ] Database queries use indexes
- [ ] Image optimization working
- [ ] Code splitting verified
- [ ] Bundle size < 500KB (gzipped)
- [ ] Lighthouse score > 80
- [ ] Core Web Vitals all green

### Error Handling
- [ ] Network error shows user-friendly message
- [ ] Invalid input shows validation error
- [ ] 404 errors handled gracefully
- [ ] 500 errors show error boundary
- [ ] Timeout errors retry automatically
- [ ] Duplicate submission prevented
- [ ] File upload errors handled

### Browser Compatibility
- [ ] Chrome/Edge latest version
- [ ] Firefox latest version
- [ ] Safari latest version
- [ ] Mobile Safari iOS 14+
- [ ] Chrome Mobile Android 10+

## Production Deployment Checklist

### Environment Setup
- [ ] All env vars set in Vercel
- [ ] Database connection pooling enabled
- [ ] Vercel Blob storage configured
- [ ] Analytics service initialized
- [ ] Error tracking enabled
- [ ] Logging service configured
- [ ] SMTP for email configured (future)

### Database
- [ ] All migrations run successfully
- [ ] Indexes created on all tables
- [ ] RLS policies enabled
- [ ] Connection limits set appropriately
- [ ] Backups configured
- [ ] Database monitoring enabled
- [ ] Query logging enabled

### Security
- [ ] Security headers verified via curl
- [ ] SSL/TLS certificate valid
- [ ] HTTPS enforced
- [ ] Secrets not in repository
- [ ] API rate limits configured
- [ ] DDoS protection enabled
- [ ] WAF rules deployed
- [ ] Regular security audits scheduled

### Infrastructure
- [ ] CDN for static assets configured
- [ ] Database replicas for failover
- [ ] Load balancing tested
- [ ] Health checks configured
- [ ] Auto-scaling policies set
- [ ] Monitoring dashboards created
- [ ] Alert thresholds set

### Monitoring & Logging
- [ ] Application logging working
- [ ] Error tracking receiving reports
- [ ] Performance metrics collected
- [ ] Uptime monitoring active
- [ ] Alert notifications configured
- [ ] Dashboard accessible to team
- [ ] Log retention policies set

### Backup & Recovery
- [ ] Database backups automated daily
- [ ] Backup restoration tested
- [ ] Recovery time objective < 1 hour
- [ ] Recovery point objective < 15 mins
- [ ] Disaster recovery plan documented
- [ ] Runbook created for incidents

### Post-Deployment
- [ ] Verify all features working in production
- [ ] Monitor error rates (target: < 0.1%)
- [ ] Monitor performance metrics
- [ ] Check analytics reporting
- [ ] Verify email notifications (when added)
- [ ] User feedback collection started
- [ ] Create post-launch support plan

## Performance Benchmarks (Production)

- First Contentful Paint: < 1.5s
- Largest Contentful Paint: < 2.5s
- Cumulative Layout Shift: < 0.1
- Time to Interactive: < 3.5s
- API Response Time p95: < 500ms
- Database Query p95: < 100ms
- Error Rate: < 0.1%
- Uptime Target: 99.9%

## Sign-Off

- [ ] QA Lead: _________________ Date: _______
- [ ] Engineering Lead: _________________ Date: _______
- [ ] Product Manager: _________________ Date: _______
- [ ] DevOps/Infra: _________________ Date: _______
