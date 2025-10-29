# Development Rules & Principles

> **Last Updated**: October 30, 2025  
> **Project**: SamplePOS - Point of Sale System

---

## 🎯 Code Quality Rules

- ✅ Write TypeScript - no `any` types unless absolutely necessary
- ✅ All API endpoints must have Zod validation
- ✅ Every function must have proper error handling (try-catch)
- ✅ Use meaningful variable/function names (no abbreviations like 'prd' or 'cst')
- ✅ Comment complex business logic
- ✅ One responsibility per function (Single Responsibility Principle)

---

## 🧪 Testing Rules

- ✅ Test new features before committing
- ✅ Test on actual database with real data scenarios
- ✅ Test error cases (what if product doesn't exist?)
- ✅ Verify API responses match expected format
- ✅ Test frontend-backend integration end-to-end

---

## 🗄️ Database Rules

- ✅ Never delete data - use soft deletes (isActive: false)
- ✅ Always use transactions for multi-table operations
- ✅ Use Decimal.js for money/quantity calculations (never float)
- ✅ Add indexes for frequently queried fields
- ✅ All timestamps: createdAt, updatedAt
- ✅ Backup database before major schema changes

---

## 🌐 API Design Rules

### RESTful Conventions
```
GET    /api/products       - list all
GET    /api/products/:id   - get one
POST   /api/products       - create
PUT    /api/products/:id   - update
DELETE /api/products/:id   - delete
```

### Response Format
```typescript
// Success
{ success: true, data: {...} }

// Error
{ success: false, error: "message" }
```

### HTTP Status Codes
```
200 - OK
201 - Created
400 - Bad Request (validation error)
401 - Unauthorized
404 - Not Found
500 - Server Error
```

### Best Practices
- ✅ Always paginate list endpoints (page, limit)
- ✅ Return only necessary data (don't send passwordHash to frontend!)
- ✅ Include metadata in responses (total count, page info)

---

## 🔒 Security Rules

- ✅ Never commit secrets (.env file stays local)
- ✅ Hash passwords with bcrypt (never store plain text)
- ✅ Validate and sanitize ALL user input
- ✅ Use JWT tokens with expiration
- ✅ Require authentication for all endpoints except login/register
- ✅ Use HTTPS in production
- ✅ Add rate limiting to prevent abuse
- ✅ Never expose internal errors to users

---

## ⚡ Performance Rules

- ✅ Cache frequently accessed data (products, settings)
- ✅ Use database indexes for search fields
- ✅ Lazy load components on frontend
- ✅ Compress API responses
- ✅ Limit query results (don't fetch 100,000 products at once)
- ✅ Use connection pooling for database
- ✅ Optimize images and assets
- ✅ Use pagination for large datasets

---

## 📝 Git/Version Control Rules

### Commit Messages Format
```
feat: Add Redis caching for products
fix: Fix total calculation in POS
refactor: Optimize database queries
docs: Update API documentation
test: Add unit tests for products API
chore: Update dependencies
```

### Best Practices
- ✅ Commit frequently with meaningful messages
- ✅ Never commit node_modules or build files
- ✅ Never force push to main/master branch
- ✅ Create feature branches for new work
- ✅ Test locally before committing
- ✅ Never commit broken code
- ✅ Review changes before committing

---

## 📁 File Organization Rules

### Backend Structure
```
src/
  ├── config/        # Database, Redis, env configs
  ├── middleware/    # Auth, validation, error handling
  ├── modules/       # API routes (products, sales, etc.)
  ├── services/      # Business logic (reusable)
  ├── validation/    # Zod schemas
  ├── utils/         # Helper functions
  └── server.ts      # Main entry point
```

### Frontend Structure
```
src/
  ├── components/    # React components
  ├── services/api/  # API calls (React Query hooks)
  ├── config/        # Axios config
  ├── types/         # TypeScript types
  ├── utils/         # Helper functions
  └── App.tsx        # Main component
```

---

## ❌ Error Handling Rules

- ✅ Always wrap async operations in try-catch
- ✅ Log errors with context: `logger.error('Failed to create product', { error, productData })`
- ✅ Don't expose internal errors to users
- ✅ Return user-friendly error messages
- ✅ Handle database connection failures gracefully
- ✅ Retry failed operations when appropriate
- ✅ Use centralized error handling middleware

---

## 📚 Documentation Rules

- ✅ Document complex business logic
- ✅ Add JSDoc comments for exported functions
- ✅ Keep README.md updated with setup instructions
- ✅ Document environment variables in .env.example
- ✅ Add API endpoint documentation
- ✅ Document breaking changes
- ✅ Keep changelog updated

---

## 🚀 Optimization-Specific Rules

- ✅ Never optimize prematurely - measure first
- ✅ Add monitoring BEFORE optimization (know what to optimize)
- ✅ Test performance before and after changes
- ✅ Don't break existing functionality for optimization
- ✅ Add caching incrementally (one endpoint at a time)
- ✅ Keep cache invalidation simple (clear on write)
- ✅ Document cache keys and TTL (time-to-live)
- ✅ Profile before optimizing (use proper tools)

---

## 🎯 Deployment Rules

- ✅ Test in staging before production
- ✅ Have rollback plan ready
- ✅ Backup database before deployment
- ✅ Deploy during low-traffic hours
- ✅ Monitor errors after deployment
- ✅ Keep previous version accessible
- ✅ Use environment variables for configs
- ✅ Run migrations in transaction mode

---

## 🔄 Workflow for Each Task

```
1. ✅ Plan        - Write what we're doing and why
2. ✅ Measure     - Check current performance (baseline)
3. ✅ Implement   - Write the code
4. ✅ Test        - Verify it works correctly
5. ✅ Measure     - Confirm improvement
6. ✅ Document    - Add comments/docs
7. ✅ Commit      - Save to git with clear message
```

---

## ❌ What We WON'T Do

- ❌ Skip testing to save time
- ❌ Commit untested code
- ❌ Optimize without measuring
- ❌ Add complexity without clear benefit
- ❌ Break existing features
- ❌ Remove safety checks for speed
- ❌ Deploy directly to production
- ❌ Make changes without git commits
- ❌ Use console.log instead of proper logging
- ❌ Ignore TypeScript errors
- ❌ Use `any` type without justification
- ❌ Store sensitive data in code

---

## 🎨 Code Style Guidelines

### TypeScript
```typescript
// ✅ Good
interface CreateProductRequest {
  name: string;
  price: number;
}

// ❌ Bad
interface CreateProductReq {
  n: string;
  p: any;
}
```

### Naming Conventions
```typescript
// Variables & Functions: camelCase
const productList = [];
function calculateTotal() {}

// Classes & Interfaces: PascalCase
class ProductService {}
interface ProductData {}

// Constants: UPPER_SNAKE_CASE
const MAX_RETRIES = 3;
const API_BASE_URL = 'http://localhost:3001';

// Files: kebab-case
product-service.ts
api-config.ts
```

### Function Guidelines
```typescript
// ✅ Good - Single responsibility, clear name
async function createProduct(data: CreateProductRequest): Promise<Product> {
  try {
    const validated = CreateProductSchema.parse(data);
    const product = await prisma.product.create({ data: validated });
    return product;
  } catch (error) {
    logger.error('Failed to create product', { error, data });
    throw error;
  }
}

// ❌ Bad - Multiple responsibilities, unclear name
async function doStuff(d: any) {
  const p = await db.product.create({ data: d });
  await db.log.create({ data: { action: 'create' } });
  sendEmail(d.email);
  return p;
}
```

---

## 🔧 Environment Variables

### Required Variables (.env)
```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/pos_system"

# JWT
JWT_SECRET="your-secret-key-change-in-production"
JWT_EXPIRES_IN="7d"

# Server
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Redis (when added)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Company Settings
COMPANY_NAME="Your Company Name"
CURRENCY="USD"
```

---

## 📊 Performance Targets

### API Response Times
```
- Simple queries (GET product by ID): < 50ms
- List queries (GET products): < 200ms
- Complex queries (reports): < 2s
- Mutations (POST/PUT): < 500ms
```

### Frontend
```
- Initial page load: < 3s
- Page transitions: < 500ms
- Form submissions: < 1s
```

### Database
```
- Query execution: < 100ms (95th percentile)
- Connection pool: 20-50 connections
- Index usage: 90%+ of queries
```

---

## 🛡️ Security Checklist

- [ ] All endpoints require authentication (except login/register)
- [ ] Passwords are hashed with bcrypt
- [ ] JWT tokens have expiration
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention (Prisma ORM)
- [ ] XSS prevention (React escaping + CSP headers)
- [ ] CSRF protection
- [ ] Rate limiting implemented
- [ ] HTTPS in production
- [ ] Secrets not in code
- [ ] Database backups enabled
- [ ] Error messages don't leak sensitive info

---

## 📈 Monitoring & Logging

### What to Log
```typescript
// ✅ Good
logger.info('User logged in', { userId, ip, timestamp });
logger.error('Failed to process payment', { orderId, amount, error: error.message });

// ❌ Bad
console.log('login');
console.log(error); // Logs entire error object with stack trace to user
```

### What to Monitor
- API response times
- Error rates
- Database query performance
- Memory usage
- CPU usage
- Disk space
- Active connections
- Cache hit rates

---

## 🔄 Code Review Checklist

Before committing, verify:
- [ ] Code follows TypeScript best practices
- [ ] All functions have error handling
- [ ] Validation schemas exist for API endpoints
- [ ] No sensitive data in code
- [ ] Tests pass (when available)
- [ ] No console.log statements
- [ ] Meaningful variable names
- [ ] Comments for complex logic
- [ ] No TypeScript `any` types
- [ ] Dependencies are necessary
- [ ] Git commit message is clear

---

## 📞 When to Ask for Help

- Security concerns
- Performance bottlenecks
- Complex business logic decisions
- Database schema changes
- Breaking API changes
- Deployment issues
- Data migration needs

---

**Remember**: These rules exist to maintain code quality, security, and performance. Follow them consistently for a robust, maintainable application.
