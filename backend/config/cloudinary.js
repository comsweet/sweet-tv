const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Cloudinary config från environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer storage för BILDER (profile images)
const imageStorage = new CloudinaryStorage({
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

// Multer storage för LJUD (sound files)
const soundStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'sweet-tv-sounds',
    resource_type: 'video', // Cloudinary använder "video" för audio också
    allowed_formats: ['mp3', 'wav', 'ogg'],
    public_id: (req, file) => {
      // Custom filename: sound-{timestamp}
      const timestamp = Date.now();
      const originalName = file.originalname.replace(/\.[^/.]+$/, ''); // Ta bort extension
      return `sound-${originalName}-${timestamp}`;
    }
  }
});

module.exports = { cloudinary, imageStorage, soundStorage };
