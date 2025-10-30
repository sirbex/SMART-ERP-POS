# Phase 1 Testing Guide

## ✅ How to Test Phase 1 Improvements

### Prerequisites
1. Backend running: `http://localhost:3001`
2. Frontend running: `http://localhost:5173`
3. Logged into the application

---

## 🧪 Test 1: Caching (Products Endpoint)

### Steps:
1. Open browser DevTools (F12) → Network tab
2. Navigate to Products page or any page that calls `/api/products`
3. **First load**: Check response headers
   - `X-Cache-Hit: false` (queried database)
   - Note the response time (e.g., 150ms)
4. Refresh the page or navigate away and back
5. **Second load**: Check response headers
   - `X-Cache-Hit: true` (served from cache)
   - Response time should be much faster (e.g., 5-20ms)

### Expected Result:
- ✅ First request: `X-Cache-Hit: false`, slower
- ✅ Subsequent requests: `X-Cache-Hit: true`, **5-10x faster**
- ✅ Cache expires after 5 minutes (default TTL)

---

## 🧪 Test 2: Rate Limiting

### Steps:
1. Open browser DevTools → Network tab
2. Make any API request (e.g., `/api/products`)
3. Check response headers:
   - `RateLimit-Limit: 100` (max requests)
   - `RateLimit-Remaining: 99` (requests left)
   - `RateLimit-Reset: <timestamp>` (when limit resets)

### Test Auth Rate Limiting:
1. Open Network tab
2. Try logging in multiple times with wrong password
3. After 10 attempts, you should get:
   - Status: `429 Too Many Requests`
   - Error: "Too many authentication attempts..."

### Expected Result:
- ✅ Headers show rate limit info
- ✅ Limit: 100 requests per 15 minutes
- ✅ Auth limit: 10 attempts per 15 minutes
- ✅ 429 error after exceeding limit

---

## 🧪 Test 3: Request Logging

### Steps:
1. Open backend terminal (where `npx tsx watch src/server.ts` is running)
2. Make any API request from frontend
3. Check terminal logs

### Expected Log Format:
```
[info]: → GET /api/products
[info]: ← GET /api/products 200 45ms
```

### What to Look For:
- ✅ Request start: `→ METHOD /path`
- ✅ Response end: `← METHOD /path STATUS DURATIONms`
- ✅ Status code (200, 404, 500, etc.)
- ✅ Response time in milliseconds

---

## 📊 Performance Comparison

### Before Phase 1:
- Products list: ~150ms
- No caching
- No rate limiting
- Basic logging

### After Phase 1:
- First request: ~150ms (`X-Cache-Hit: false`)
- Cached requests: ~5-20ms (`X-Cache-Hit: true`) = **5-10x faster!**
- Protected from abuse (rate limiting)
- Detailed request timing logs

---

## ✅ Quick Verification Checklist

- [ ] Cache headers present (`X-Cache-Hit: true/false`)
- [ ] Cached responses are faster (check Network tab timing)
- [ ] Rate limit headers present (`RateLimit-*`)
- [ ] Server logs show request timing (`→` and `←`)
- [ ] Auth endpoint has stricter rate limit (10 req/15min)

---

## 🐛 Troubleshooting

### Cache not working:
- Hard refresh browser (Ctrl+Shift+R)
- Clear browser cache
- Check server logs for "Cache middleware HIT/MISS"

### Rate limiting not working:
- Check headers in Network tab
- Verify `/api` routes (not root `/`)
- Check server logs for rate limit errors

### Logging not showing:
- Check correct terminal (backend, not frontend)
- Verify `logger.info` calls in server.ts
- Check log level in winston config

---

## 🎯 Success Criteria

All Phase 1 optimizations are working if:
1. **Caching**: Second load 5x+ faster with `X-Cache-Hit: true`
2. **Rate Limiting**: Headers present, 429 error after limit
3. **Logging**: Terminal shows request start/end with timing

---

## Next: Phase 2

Once Phase 1 is verified, proceed to:
- Database index optimization
- Query performance tuning
- Background job processing
- Frontend bundle optimization
