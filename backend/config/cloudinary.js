const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Cloudinary config från environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer storage för Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'sweet-tv-profiles', // Folder name i Cloudinary
    allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'webp'],
    transformation: [
      { 
        width: 500, 
        height: 500, 
        crop: 'limit', // Behåll aspect ratio
        quality: 'auto' // Auto-optimize
      }
    ],
    public_id: (req, file) => {
      // Custom filename: agent-{userId}-{timestamp}
      return `agent-${req.params.userId}-${Date.now()}`;
    }
  }
});

module.exports = { cloudinary, storage };
