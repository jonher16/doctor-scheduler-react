# H.E.R.S. Admin Portal - Doctor Access Setup Guide

## Setting Up HERS Admin Access for Doctors

The authentication system uses your existing doctor accounts from the doctor availability app. You just need to add the `isHersAdmin` field to grant access to the HERS admin portal.

### Method 1: Direct Firestore Modification (Fastest)

1. Go to your Firebase Console: https://console.firebase.google.com/
2. Select your project: `doctor-scheduler-portal`
3. Navigate to **Firestore Database** → **doctors** collection
4. Find the doctor document you want to grant access to (like `7z12ZuZNy3dkCpT4u209agugJRV2`)
5. Edit the document and add:
   ```json
   {
     "isHersAdmin": true
   }
   ```
6. Save the changes

### Method 2: Through the Admin Interface (After you have access)

Once you have HERS admin access:

1. Sign in to the HERS Admin Portal
2. Go to **Doctor Access Management** in the menu
3. Find the doctor you want to grant access to
4. Click the edit button
5. Toggle "H.E.R.S. Admin Access" to ON
6. Save changes

## Understanding the Doctor Document Structure

Your existing doctor documents should look something like this:
```json
{
  "email": "1999.jon@gmail.com",
  "name": "Jon",
  "seniority": "Junior",
  "pref": "None",
  "userId": "7z12ZuZNy3dkCpT4u209agugJRV2",
  "isHersAdmin": true  // Add this field
}
```

## Access Control

- **Regular doctors**: Can access the doctor availability app but NOT the HERS admin portal
- **HERS admins**: Can access both the availability app AND the HERS admin portal
- Only doctors with `isHersAdmin: true` in their document can access the admin portal

## Security Notes

- The system uses the existing `doctors` collection from your availability app
- Authentication is handled by Firebase Auth (same login system)
- Access is controlled by the `isHersAdmin` field in each doctor's document
- Users without HERS admin access will see an "Access Denied" screen

## Troubleshooting

### "Access Denied" Message
- Check that the doctor has `isHersAdmin: true` in their Firestore document
- Verify the doctor is signed in with the correct email address
- Make sure the Firebase Auth UID matches the document ID in the `doctors` collection

### Doctor Not Found in Access Management
- The doctor needs to sign in at least once to appear in the system
- Check that the Firebase Authentication is properly configured
- Verify that the doctor's UID matches their document ID in the `doctors` collection

### Firebase Connection Issues
- Verify all Firebase environment variables are set correctly
- Check that Firestore rules allow read/write access for authenticated users
- Ensure the Firebase project is active and billing is enabled if required

## Quick Setup for Your Account

Based on your screenshot, to give yourself HERS admin access:

1. Go to Firebase Console → Firestore → `doctors` collection
2. Find document `7z12ZuZNy3dkCpT4u209agugJRV2`  
3. Add field: `isHersAdmin: true`
4. Save and try logging in again 