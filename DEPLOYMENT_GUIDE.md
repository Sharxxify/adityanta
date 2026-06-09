# 🚀 Deploy Updated Frontend with Debugging

## Files Ready for Deployment

**Location:** `c:\Users\Shrey\OneDrive\Desktop\Adiyanta\dist\`

These files include:
- ✅ Frame sizing fixes (responsive positioning)
- ✅ Canvas overflow fixes (proper padding)
- ✅ Comprehensive template fetching logs
- ✅ Premium upgrade fixes
- ✅ Upload improvements

---

## Deploy to EC2

### Option 1: Use SCP (Recommended)

```powershell
# In PowerShell (Windows):
# STEP 1: Replace path to your EC2 key
$EC2_KEY = "C:\path\to\your-ec2-key.pem"
$EC2_USER = "ec2-user"
$EC2_HOST = "ec2-16-171-146-239.eu-north-1.compute.amazonaws.com"
$FRONTEND_PATH = "/home/ec2-user/adityanta-customer-frontend"

# STEP 2: Copy dist files to EC2
scp -i $EC2_KEY -r "c:\Users\Shrey\OneDrive\Desktop\Adiyanta\dist\*" "$EC2_USER@$EC2_HOST`:$FRONTEND_PATH/"

# STEP 3: SSH and reload nginx
ssh -i $EC2_KEY "$EC2_USER@$EC2_HOST" "sudo systemctl reload nginx && echo 'nginx reloaded'"
```

### Option 2: Manual Pack and Deploy

```powershell
# Create zip file
Compress-Archive -Path "c:\Users\Shrey\OneDrive\Desktop\Adiyanta\dist\*" -DestinationPath "c:\Users\Shrey\OneDrive\Desktop\frontend-update.zip" -Force

# Copy zip to EC2
scp -i $EC2_KEY "c:\Users\Shrey\OneDrive\Desktop\frontend-update.zip" "$EC2_USER@$EC2_HOST":/tmp/

# SSH into EC2 and extract
ssh -i $EC2_KEY "$EC2_USER@$EC2_HOST" "cd $FRONTEND_PATH && unzip -o /tmp/frontend-update.zip && sudo systemctl reload nginx"
```

---

## 🧪 Test After Deployment

### 1. Check Nginx Serving Files

```bash
# SSH into EC2
ssh -i your-key.pem ec2-user@ec2-16-171-146-239.eu-north-1.compute.amazonaws.com

# Verify files are in place
ls -lah /home/ec2-user/adityanta-customer-frontend/

# Check nginx config
sudo nginx -t  # Should show: successful

# Reload nginx
sudo systemctl reload nginx
```

### 2. Open in Browser and Check Console

```
1. Open: http://ec2-16-171-146-239.eu-north-1.compute.amazonaws.com/home
2. Press F12 (DevTools)
3. Go to Console tab
4. Look for these logs:
```

**✅ Good - Templates Loading:**
```
🔄 HomePage: Fetching templates - Premium status: { isPremium: false, userId: "...", membership: undefined }
📚 Fetching templates from: http://... { token: 'missing' }
📚 Templates API response: { status: 200, ok: true }
📚 Templates API parsed: { success: true, count: 7, data: Array(7) }
✅ Templates loaded: { count: 7, templates: [...] }
```

**❌ Bad - No Templates (This is Your Current Issue):**
```
📚 Templates API response: { status: 200, ok: true }
📚 Templates API parsed: { success: true, count: 0, data: Array(0) }
✅ Templates loaded: { count: 0, templates: [] }
```

**❌ Bad - API Failed:**
```
❌ Templates fetch failed: { status: 404, error: "..." }
```

---

## 🔥 Troubleshooting

### Templates Still Not Showing

**Step 1: Check Backend is Running**
```bash
# SSH into EC2
ssh -i your-key.pem ec2-user@ec2-16-171-146-239.eu-north-1.compute.amazonaws.com

# Check backend
pm2 status

# Should show: adityanta-backend   online

# If offline, restart
pm2 restart adityanta
```

**Step 2: Test Backend API Directly**
```bash
# Test templates endpoint
curl http://localhost:3001/api/v1/templates

# Should return something like:
# {"success":true,"templates":[...list of templates...]}

# If empty array or error, backend needs fixing
```

**Step 3: Check Backend Logs**
```bash
pm2 logs adityanta-backend | tail -50
```

---

## ✅ Deployment Verification

After deployment, verify:

- [ ] Files are on EC2: `ls /home/ec2-user/adityanta-customer-frontend/dist/`
- [ ] Nginx is running: `systemctl status nginx`
- [ ] App loads: Open in browser
- [ ] Console has no errors
- [ ] Check templates log: Should show API response
- [ ] Look for `count: 0` or `count: 7` in logs

---

## 📊 Current Status

| Component | Status | Issue |
|-----------|--------|-------|
| Frontend Build | ✅ Working | None |
| Frame Sizing | ✅ Fixed | Responsive now |
| Canvas Padding | ✅ Fixed | Overflow fixed |
| Upload Feature | ✅ Enhanced | Better error handling |
| Template Fetch Logic | ✅ Working | Has comprehensive logging |
| **Backend API** | ❌ **BROKEN** | **Returns empty templates array** |
| **Database** | ❓ **UNKNOWN** | **Unknown if has template data** |

---

## 🎯 Next Action: Fix Backend

The frontend is ready! Now you need to:

1. **SSH into EC2**
2. **Check backend template endpoint**: `curl http://localhost:3001/api/v1/templates`
3. **If empty:** Seed database with template data
4. **If 404:** Add missing route in backend
5. **Then redeploy** or just restart backend with `pm2 restart adityanta`

See `TEMPLATES_MISSING_DEBUG.md` for detailed backend diagnostic steps.
