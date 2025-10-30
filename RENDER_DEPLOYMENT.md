# 🚀 Render Deployment Guide

## Backend (https://sweet-tv.onrender.com)

### Environment Variables
Set these in Render Dashboard → sweet-tv (backend) → Environment:

```
ADMIN_PASSWORD=your_secure_password
ADVERSUS_USERNAME=your_adversus_username
ADVERSUS_PASSWORD=your_adversus_password
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
POLL_INTERVAL=15000
```

### Deploy
Backend deploys automatically when pushing to main branch.

---

## Frontend (https://sweet-tv-frontend.onrender.com)

### Build Environment Variable
Set this in Render Dashboard → sweet-tv-frontend (static site) → Environment:

```
VITE_API_URL=https://sweet-tv.onrender.com/api
```

**IMPORTANT:** This MUST be set as a **Build Environment Variable** because Vite bundles environment variables at build time, not runtime.

### Deploy
1. Push changes to branch
2. Merge to main
3. Frontend will rebuild automatically with the correct API URL

---

## Testing After Deployment

1. **Backend Health Check:**
   ```bash
   curl https://sweet-tv.onrender.com/api/health
   ```
   Expected: `{"status":"ok","timestamp":"...","message":"Sweet TV API is running"}`

2. **Frontend Login:**
   - Go to https://sweet-tv-frontend.onrender.com
   - Enter ADMIN_PASSWORD
   - Should authenticate successfully

3. **Check Browser Console:**
   - Open DevTools → Console
   - Should see API requests going to `https://sweet-tv.onrender.com/api`
   - NOT `localhost:5000`

---

## Troubleshooting

### "Could not connect to server" error
- Check that `VITE_API_URL` is set in frontend build environment
- Rebuild frontend static site
- Check browser console for actual API URL being used

### "Invalid password" error
- Verify `ADMIN_PASSWORD` is set correctly in backend environment
- Check backend logs in Render dashboard
- Test backend auth endpoint directly:
  ```bash
  curl -X POST https://sweet-tv.onrender.com/api/auth/admin-login \
    -H "Content-Type: application/json" \
    -d '{"password":"your_password"}'
  ```

### Notification settings won't load
- Check that Adversus API credentials are set correctly
- Check backend logs for API errors
- Verify `/groups` endpoint is accessible

---

## User Groups Configuration

✅ **CORRECT:** We use `user.group.id` from Adversus API
❌ **WRONG:** Do NOT use `user.membersOf`

The system correctly syncs groups using:
- `user.group.id` - Group ID
- `user.group.name` - Group name

---

## Cache Behavior

### Leaderboard Cache
- Automatically cleared when new deals are added
- Updates happen while notification popup is shown
- Ensures fresh stats on all leaderboards

### Commission Cache
- 30-second TTL (reduced from 5 minutes)
- Balances freshness with API rate limits
- Auto-syncs every 2 minutes via polling service
