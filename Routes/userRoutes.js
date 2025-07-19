import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import {
  getUserProfile,
  getUserPosts,
  getUserBlogs,
  getUserFollowers,
  getUserFollowing,
  followUser,
  updateUserProfile,
  getUserBookmarks,
  addBookmark,
  removeBookmark,
  getSuggestedUsers,
  searchUsers,
} from "../Controllers/userController.js";

const router = express.Router();

// Public routes
router.get("/:id/posts", getUserPosts);
router.get("/:id/blogs", getUserBlogs);
router.get("/:id/followers", getUserFollowers);
router.get("/:id/following", getUserFollowing);
router.get("/:id/bookmarks", getUserBookmarks);

// Protected routes
router.get("/search", authenticateToken, searchUsers);
router.get("/:id", getUserProfile);
router.post("/:id/follow", authenticateToken, followUser);
router.put("/profile", authenticateToken, updateUserProfile);
router.post("/bookmarks", authenticateToken, addBookmark);
router.delete("/bookmarks/:id", authenticateToken, removeBookmark);
router.get("/suggested", authenticateToken, getSuggestedUsers);

export default router;
