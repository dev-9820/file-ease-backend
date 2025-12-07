const express = require('express');
const mongoose = require('mongoose');
const { GridFsStorage } = require('multer-gridfs-storage');
const multer = require('multer');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const auth = require('../middleware/auth');
const FileMeta = require('../models/FileMeta');
const Permission = require('../models/Permission');
const ShareLink = require('../models/ShareLink');
const User = require('../models/User');

const router = express.Router();
const MONGO_URI = process.env.MONGO_URI;

// Setup GridFS storage with multer-gridfs-storage
const maxUploadMB = parseInt(process.env.MAX_UPLOAD_SIZE_MB || '20', 10);
const storage = new GridFsStorage({
  url: MONGO_URI,
  file: (req, file) => {
    // sanitize filename or create unique name
    const fileInfo = {
      filename: `${Date.now()}-${file.originalname}`,
      bucketName: 'uploads'
    };
    return fileInfo;
  }
});

// Validation: allowed types (customize)
const allowedMime = [
  'application/pdf',
  'image/png', 'image/jpeg','image/jpg','image/gif',
  'text/csv','application/vnd.ms-excel',
  'application/zip','application/x-zip-compressed'
];

const upload = multer({
  storage,
  limits: { fileSize: maxUploadMB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!allowedMime.includes(file.mimetype)) {
      return cb(new Error('File type not allowed: ' + file.mimetype));
    }
    cb(null, true);
  }
});

// multer supports array for bulk uploads
router.post('/upload', auth, upload.array('files', 20), async (req, res, next) => {
  try {
    // multer-gridfs-storage puts file info in req.files
    if(!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
    // Save metadata to FileMeta collection
    const saved = [];
    for(const f of req.files) {
      // f.id is the GridFS file id (mongoose ObjectId) or f._id depending on lib version
      const gridFsId = f.id || f._id;
      const meta = await FileMeta.create({
        filename: f.originalname,
        owner: req.user._id,
        contentType: f.mimetype,
        size: f.size,
        gridFsId
      });
      saved.push(meta);
    }
    res.json({ files: saved });
  } catch(err) { next(err); }
});

router.get('/list', auth, async (req, res, next) => {
  try {
    // 1. Fetch ownership files (with owner field populated)
    const ownerFiles = await FileMeta.find({ owner: req.user._id })
      .populate("owner", "name email") // ADD THIS
      .lean();

    // 2. Fetch permissions for shared files
    const perms = await Permission.find({ grantee: req.user._id })
      .populate({
        path: "file",
        populate: {
          path: "owner",
          select: "name email"          // ADD THIS
        }
      })
      .lean();

    const sharedFiles = perms.map(p => p.file).filter(Boolean);

    return res.json({ own: ownerFiles, shared: sharedFiles });

  } catch (err) {
    next(err);
  }
});

// List Shared Things for a File : Both to Users and Publicly Accessed Link
router.get('/shares/:fileId', auth, async (req, res, next) => {
  try {
    const fileId = req.params.fileId;

    const perms = await Permission.find({ file: fileId }).populate('file owner grantee').lean();
    const sharedLinks = await ShareLink.find({ file: fileId}).populate('file owner').lean();
    res.json({ users: perms, links: sharedLinks });
  } catch(err) { next(err); }
});

// Download a file by id: check authorization
router.get('/download/:fileId', auth, async (req, res, next) => {
  try {
    const fileId = req.params.fileId;
    if(!mongoose.Types.ObjectId.isValid(fileId)) return res.status(400).json({ error: 'Invalid file id' });
    const meta = await FileMeta.findById(fileId);
    if(!meta) return res.status(404).json({ error: 'File not found' });

    const isOwner = meta.owner.toString() === req.user._id.toString();
    if(!isOwner) {
      // check permission
      const perm = await Permission.findOne({ file: meta._id, grantee: req.user._id });
      if(!perm) return res.status(403).json({ error: 'Access denied' });
    }

    // stream from GridFS
    const conn = mongoose.connection;
    const bucket = new mongoose.mongo.GridFSBucket(conn.db, { bucketName: 'uploads' });
    res.setHeader('Content-Disposition', `attachment; filename="${meta.filename}"`);
    res.setHeader('Content-Type', meta.contentType || 'application/octet-stream');

    const downloadStream = bucket.openDownloadStream(meta.gridFsId);
    downloadStream.on('error', (err) => {
      return next(err);
    });
    downloadStream.pipe(res);
  } catch(err) { next(err); }
});

// Generate share link (owner only)
router.post('/share/link/:fileId', auth, async (req, res, next) => {
  try {
    const fileId = req.params.fileId;
    const { expiresInSeconds } = req.body; // optional
    if(!mongoose.Types.ObjectId.isValid(fileId)) return res.status(400).json({ error: 'Invalid file id' });
    const meta = await FileMeta.findById(fileId);
    if(!meta) return res.status(404).json({ error: 'File not found' });
    if(meta.owner.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Only owner can create share link' });

    const token = crypto.randomBytes(20).toString('hex');
    const doc = { token, file: meta._id, owner: req.user._id };
    if(expiresInSeconds && Number(expiresInSeconds) > 0) {
      doc.expiresAt = new Date(Date.now() + Number(expiresInSeconds)*1000);
    }

    const link = await ShareLink.create(doc);
    // return an application route that the frontend will call: /api/files/access-link/:token
    res.json({ link: `/api/files/access-link/${link.token}`, expiresAt: link.expiresAt });
  } catch(err) { next(err); }
});

// Access a file by share link token. **User must be logged in (account-only)**
router.get('/access-link/:token', auth, async (req, res, next) => {
  try {
    const token = req.params.token;
    const link = await ShareLink.findOne({ token });
    if(!link) return res.status(404).json({ error: 'Share link not found or expired' });

    const meta = await FileMeta.findById(link.file);
    if(!meta) return res.status(404).json({ error: 'File not found' });

    // token exists (non-expired because TTL index deletes expired links)
    // additionally enforce that only logged-in users can use it (we already have auth)
    // stream file
    const conn = mongoose.connection;
    const bucket = new mongoose.mongo.GridFSBucket(conn.db, { bucketName: 'uploads' });
    res.setHeader('Content-Disposition', `attachment; filename="${meta.filename}"`);
    res.setHeader('Content-Type', meta.contentType || 'application/octet-stream');
    const s = bucket.openDownloadStream(meta.gridFsId);
    s.on('error', err => next(err));
    s.pipe(res);
  } catch(err) { next(err); }
});

// Add this route to your backend
router.get('/access-info/:token', auth, async (req, res) => {
  try {
    const token = req.params.token;
    const link = await ShareLink.findOne({ token });
    
    if (!link) {
      return res.status(404).json({ error: 'Share link not found or expired' });
    }

    const meta = await FileMeta.findById(link.file);
    if (!meta) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Get owner info
    const owner = await User.findById(meta.owner).select('name email');

    res.json({
      filename: meta.filename,
      size: meta.size,
      contentType: meta.contentType,
      owner: {
        _id: owner._id,
        name: owner.name,
        email: owner.email
      },
      createdAt: link.createdAt,
      expiresAt: link.expiresAt,
      downloadCount: link.downloadCount || 0,
      valid: true
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch file info' });
  }
});

// Share with specific user(s): owner adds Permission docs
router.post('/share/users/:fileId', auth, async (req, res, next) => {
  try {
    const fileId = req.params.fileId;
    const { userIds, expiresInSeconds } = req.body; // userIds: array of user ids
    if(!Array.isArray(userIds) || userIds.length === 0) return res.status(400).json({ error: 'userIds required' });

    if(!mongoose.Types.ObjectId.isValid(fileId)) return res.status(400).json({ error: 'Invalid file id' });
    const meta = await FileMeta.findById(fileId);
    if(!meta) return res.status(404).json({ error: 'File not found' });
    if(meta.owner.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Only owner can share' });

    const created = [];
    for(const uid of userIds) {
      if(!mongoose.Types.ObjectId.isValid(uid)) continue;
      const user = await User.findById(uid);
      if(!user) continue;
      const doc = {
        file: meta._id,
        grantee: user._id,
        owner: req.user._id
      };
      if(expiresInSeconds && Number(expiresInSeconds) > 0) {
        doc.expiresAt = new Date(Date.now() + Number(expiresInSeconds)*1000);
      }
      // upsert to avoid duplicates
      const perm = await Permission.findOneAndUpdate(
        { file: meta._id, grantee: user._id },
        doc,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      created.push(perm);
    }
    res.json({ created });
  } catch(err) { next(err); }
});

router.post('/revoke/user/:fileId', auth, async (req, res, next) => {
  try {
    const { userId } = req.body;
    const fileId = req.params.fileId;

    const meta = await FileMeta.findById(fileId);
    if (!meta) return res.status(404).json({ error: 'File not found' });

    if (meta.owner.toString() !== req.user._id.toString())
      return res.status(403).json({ error: 'Only owner can revoke' });

    const result = await Permission.deleteOne({ file: meta._id, grantee: userId });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Revoke link (owner)
router.post('/revoke/link/:token', auth, async (req, res, next) => {
  try {
    const token = req.params.token;
    const link = await ShareLink.findOne({ token });
    if(!link) return res.status(404).json({ error: 'Not found' });
    if(link.owner.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Only owner' });
    await ShareLink.deleteOne({ token });
    res.json({ ok: true });
  } catch(err) { next(err); }
});

// Delete a file (owner only) - remove metadata + GridFS file + related permissions/links
router.delete('/:fileId', auth, async (req, res, next) => {
  try {
    const fileId = req.params.fileId;
    if(!mongoose.Types.ObjectId.isValid(fileId)) return res.status(400).json({ error: 'Invalid id' });
    const meta = await FileMeta.findById(fileId);
    if(!meta) return res.status(404).json({ error: 'File not found' });
    if(meta.owner.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Only owner' });

    const conn = mongoose.connection;
    const bucket = new mongoose.mongo.GridFSBucket(conn.db, { bucketName: 'uploads' });
    // Delete file from GridFS
    await bucket.delete(meta.gridFsId);
    // Delete metadata
    await FileMeta.deleteOne({ _id: meta._id });
    // Delete permissions and share links
    await Permission.deleteMany({ file: meta._id });
    await ShareLink.deleteMany({ file: meta._id });

    res.json({ ok: true });
  } catch(err) { next(err); }
});

module.exports = router;
