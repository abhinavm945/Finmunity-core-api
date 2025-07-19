import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import cloudinary from "../utils/cloudinary.js";
import getDataUri from "../utils/datauri.js";
import { emitNotification } from "../socket/socket.js";

const prisma = new PrismaClient();

// ===========================================
// POST CONTROLLERS
// ===========================================

export const createPost = async (req, res) => {
  try {
    const { content } = req.body;
    const image = req.file;
    const userId = req.user.id;

    if (!content && !image) {
      return res.status(400).json({
        success: false,
        message: "Post must have content or image",
      });
    }

    let imageUrl = null;

    // Handle image upload
    if (image) {
      // Optimize image using Sharp
      const optimizedImageBuffer = await sharp(image.buffer)
        .resize(800, 800, { fit: "inside" })
        .jpeg({ quality: 80 })
        .toBuffer();

      // Convert to data URI
      const fileUri = `data:image/jpeg;base64,${optimizedImageBuffer.toString(
        "base64"
      )}`;

      // Upload to Cloudinary
      const cloudResponse = await cloudinary.uploader.upload(fileUri, {
        folder: "finmunity/posts",
      });

      imageUrl = cloudResponse.secure_url;
    }

    // Get user info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, profilePicture: true },
    });

    // Create post
    const post = await prisma.post.create({
      data: {
        content: content || "",
        image: imageUrl,
        userId,
        username: user.username,
        profilePicture: user.profilePicture,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            profilePicture: true,
          },
        },
        comments: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                profilePicture: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        likes: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                profilePicture: true,
              },
            },
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: "Post created successfully",
      post,
    });
  } catch (error) {
    console.error("Error creating post:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getAllPosts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const posts = await prisma.post.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            profilePicture: true,
          },
        },
        comments: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                profilePicture: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        likes: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                profilePicture: true,
              },
            },
          },
        },
      },
    });

    const totalPosts = await prisma.post.count();
    const totalPages = Math.ceil(totalPosts / limit);

    res.status(200).json({
      success: true,
      posts,
      pagination: {
        currentPage: page,
        totalPages,
        totalPosts,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching posts:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getPostById = async (req, res) => {
  try {
    const { id } = req.params;

    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            profilePicture: true,
          },
        },
        comments: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                profilePicture: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        likes: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                profilePicture: true,
              },
            },
          },
        },
      },
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    // Increment view count
    await prisma.post.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    res.status(200).json({
      success: true,
      post,
    });
  } catch (error) {
    console.error("Error fetching post:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const updatePost = async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const image = req.file;
    const userId = req.user.id;

    const post = await prisma.post.findUnique({
      where: { id },
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    if (post.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this post",
      });
    }

    let imageUrl = post.image;

    // Handle image upload if new image is provided
    if (image) {
      // Optimize image using Sharp
      const optimizedImageBuffer = await sharp(image.buffer)
        .resize(800, 800, { fit: "inside" })
        .jpeg({ quality: 80 })
        .toBuffer();

      // Convert to data URI
      const fileUri = `data:image/jpeg;base64,${optimizedImageBuffer.toString(
        "base64"
      )}`;

      // Upload to Cloudinary
      const cloudResponse = await cloudinary.uploader.upload(fileUri, {
        folder: "finmunity/posts",
      });

      imageUrl = cloudResponse.secure_url;
    }

    const updatedPost = await prisma.post.update({
      where: { id },
      data: {
        content: content || post.content,
        image: imageUrl,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            profilePicture: true,
          },
        },
        comments: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                profilePicture: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        likes: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                profilePicture: true,
              },
            },
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      message: "Post updated successfully",
      post: updatedPost,
    });
  } catch (error) {
    console.error("Error updating post:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const deletePost = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const post = await prisma.post.findUnique({
      where: { id },
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    if (post.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this post",
      });
    }

    // Delete related data
    await prisma.$transaction([
      prisma.like.deleteMany({
        where: { postId: id },
      }),
      prisma.bookmark.deleteMany({
        where: { itemId: id, type: "POST" },
      }),
      prisma.communityComment.deleteMany({
        where: { postId: id },
      }),
      prisma.post.delete({
        where: { id },
      }),
    ]);

    res.status(200).json({
      success: true,
      message: "Post deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting post:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const likePost = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const post = await prisma.post.findUnique({
      where: { id },
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    // Check if already liked
    const existingLike = await prisma.like.findFirst({
      where: {
        userId,
        postId: id,
      },
    });

    if (existingLike) {
      // Unlike
      await prisma.like.delete({
        where: { id: existingLike.id },
      });

      // Get updated likes count
      const updatedLikes = await prisma.like.findMany({
        where: { postId: id },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              profilePicture: true,
            },
          },
        },
      });

      res.status(200).json({
        success: true,
        message: "Post unliked",
        liked: false,
        likes: updatedLikes,
      });
    } else {
      // Like
      await prisma.like.create({
        data: {
          userId,
          postId: id,
        },
      });

      // Send notification if not liking own post
      if (post.userId !== userId) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { username: true, profilePicture: true },
        });

        await prisma.notification.create({
          data: {
            userId: post.userId,
            type: "like",
            fromUserId: userId,
            fromUsername: user.username,
            content: `${user.username} liked your post`,
            itemId: id,
            itemType: "POST",
          },
        });

        // Emit real-time notification
        emitNotification(post.userId, {
          type: "like",
          fromUser: user,
          content: `${user.username} liked your post`,
          itemId: id,
          itemType: "POST",
        });
      }

      // Get updated likes count
      const updatedLikes = await prisma.like.findMany({
        where: { postId: id },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              profilePicture: true,
            },
          },
        },
      });

      res.status(200).json({
        success: true,
        message: "Post liked",
        liked: true,
        likes: updatedLikes,
      });
    }
  } catch (error) {
    console.error("Error liking post:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const bookmarkPost = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const post = await prisma.post.findUnique({
      where: { id },
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    // Check if already bookmarked
    const existingBookmark = await prisma.bookmark.findFirst({
      where: {
        userId,
        itemId: id,
        type: "POST",
      },
    });

    if (existingBookmark) {
      // Remove bookmark
      await prisma.bookmark.delete({
        where: { id: existingBookmark.id },
      });

      res.status(200).json({
        success: true,
        message: "Post removed from bookmarks",
        bookmarked: false,
      });
    } else {
      // Add bookmark
      await prisma.bookmark.create({
        data: {
          userId,
          itemId: id,
          type: "POST",
        },
      });

      res.status(200).json({
        success: true,
        message: "Post bookmarked",
        bookmarked: true,
      });
    }
  } catch (error) {
    console.error("Error bookmarking post:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// ===========================================
// BLOG CONTROLLERS
// ===========================================

export const createBlog = async (req, res) => {
  try {
    const { title, content, tags, category, gifUrl } = req.body;
    const image = req.file;
    const userId = req.user.id;

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: "Title and content are required",
      });
    }

    let imageUrl = null;
    let gifUrlToStore = null;

    // Handle image upload or gifUrl (exclusive)
    if (image) {
      // Optimize image using Sharp
      const optimizedImageBuffer = await sharp(image.buffer)
        .resize(800, 800, { fit: "inside" })
        .jpeg({ quality: 80 })
        .toBuffer();

      // Convert to data URI
      const fileUri = `data:image/jpeg;base64,${optimizedImageBuffer.toString(
        "base64"
      )}`;

      // Upload to Cloudinary
      const cloudResponse = await cloudinary.uploader.upload(fileUri, {
        folder: "finmunity/blogs",
      });

      imageUrl = cloudResponse.secure_url;
      gifUrlToStore = null;
    } else if (gifUrl) {
      imageUrl = null;
      gifUrlToStore = gifUrl;
    }

    // Get user info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, profilePicture: true },
    });

    // Create blog
    const blog = await prisma.blog.create({
      data: {
        title,
        content,
        image: imageUrl,
        gifUrl: gifUrlToStore,
        tags: tags ? tags.split(",").map((tag) => tag.trim()) : [],
        category,
        userId,
        username: user.username,
        profilePicture: user.profilePicture,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            profilePicture: true,
          },
        },
        comments: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                profilePicture: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        likes: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                profilePicture: true,
              },
            },
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: "Blog created successfully",
      blog,
    });
  } catch (error) {
    console.error("Error creating blog:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getAllBlogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const category = req.query.category;
    const search = req.query.search;

    const where = {};
    if (category) where.category = category;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { content: { contains: search, mode: "insensitive" } },
      ];
    }

    const blogs = await prisma.blog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            profilePicture: true,
          },
        },
        comments: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                profilePicture: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        likes: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                profilePicture: true,
              },
            },
          },
        },
      },
    });

    const totalBlogs = await prisma.blog.count({ where });
    const totalPages = Math.ceil(totalBlogs / limit);

    res.status(200).json({
      success: true,
      blogs,
      pagination: {
        currentPage: page,
        totalPages,
        totalBlogs,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching blogs:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getBlogById = async (req, res) => {
  try {
    const { id } = req.params;

    const blog = await prisma.blog.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            profilePicture: true,
          },
        },
        comments: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                profilePicture: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        likes: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                profilePicture: true,
              },
            },
          },
        },
      },
    });

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog not found",
      });
    }

    // Increment view count
    await prisma.blog.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    res.status(200).json({
      success: true,
      blog,
    });
  } catch (error) {
    console.error("Error fetching blog:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const updateBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, tags, category } = req.body;
    const image = req.file;
    const userId = req.user.id;

    const blog = await prisma.blog.findUnique({
      where: { id },
    });

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog not found",
      });
    }

    if (blog.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this blog",
      });
    }

    let imageUrl = blog.image;

    // Handle image upload if new image is provided
    if (image) {
      // Optimize image using Sharp
      const optimizedImageBuffer = await sharp(image.buffer)
        .resize(800, 800, { fit: "inside" })
        .jpeg({ quality: 80 })
        .toBuffer();

      // Convert to data URI
      const fileUri = `data:image/jpeg;base64,${optimizedImageBuffer.toString(
        "base64"
      )}`;

      // Upload to Cloudinary
      const cloudResponse = await cloudinary.uploader.upload(fileUri, {
        folder: "finmunity/blogs",
      });

      imageUrl = cloudResponse.secure_url;
    }

    const updatedBlog = await prisma.blog.update({
      where: { id },
      data: {
        title: title || blog.title,
        content: content || blog.content,
        image: imageUrl,
        tags: tags ? tags.split(",").map((tag) => tag.trim()) : blog.tags,
        category: category || blog.category,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            profilePicture: true,
          },
        },
        comments: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                profilePicture: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        likes: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                profilePicture: true,
              },
            },
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      message: "Blog updated successfully",
      blog: updatedBlog,
    });
  } catch (error) {
    console.error("Error updating blog:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const deleteBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const blog = await prisma.blog.findUnique({
      where: { id },
    });

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog not found",
      });
    }

    if (blog.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this blog",
      });
    }

    // Delete related data
    await prisma.$transaction([
      prisma.like.deleteMany({
        where: { blogId: id },
      }),
      prisma.bookmark.deleteMany({
        where: { itemId: id, type: "BLOG" },
      }),
      prisma.communityComment.deleteMany({
        where: { blogId: id },
      }),
      prisma.blog.delete({
        where: { id },
      }),
    ]);

    res.status(200).json({
      success: true,
      message: "Blog deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting blog:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const likeBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const blog = await prisma.blog.findUnique({
      where: { id },
    });

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog not found",
      });
    }

    // Check if already liked
    const existingLike = await prisma.like.findFirst({
      where: {
        userId,
        blogId: id,
      },
    });

    if (existingLike) {
      // Unlike
      await prisma.like.delete({
        where: { id: existingLike.id },
      });

      // Get updated likes count
      const updatedLikes = await prisma.like.findMany({
        where: { blogId: id },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              profilePicture: true,
            },
          },
        },
      });

      res.status(200).json({
        success: true,
        message: "Blog unliked",
        liked: false,
        likes: updatedLikes,
      });
    } else {
      // Like
      await prisma.like.create({
        data: {
          userId,
          blogId: id,
        },
      });

      // Send notification if not liking own blog
      if (blog.userId !== userId) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { username: true, profilePicture: true },
        });

        await prisma.notification.create({
          data: {
            userId: blog.userId,
            type: "like",
            fromUserId: userId,
            fromUsername: user.username,
            content: `${user.username} liked your blog`,
            itemId: id,
            itemType: "BLOG",
          },
        });

        // Emit real-time notification
        emitNotification(blog.userId, {
          type: "like",
          fromUser: user,
          content: `${user.username} liked your blog`,
          itemId: id,
          itemType: "BLOG",
        });
      }

      // Get updated likes count
      const updatedLikes = await prisma.like.findMany({
        where: { blogId: id },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              profilePicture: true,
            },
          },
        },
      });

      res.status(200).json({
        success: true,
        message: "Blog liked",
        liked: true,
        likes: updatedLikes,
      });
    }
  } catch (error) {
    console.error("Error liking blog:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const bookmarkBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const blog = await prisma.blog.findUnique({
      where: { id },
    });

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog not found",
      });
    }

    // Check if already bookmarked
    const existingBookmark = await prisma.bookmark.findFirst({
      where: {
        userId,
        itemId: id,
        type: "BLOG",
      },
    });

    if (existingBookmark) {
      // Remove bookmark
      await prisma.bookmark.delete({
        where: { id: existingBookmark.id },
      });

      res.status(200).json({
        success: true,
        message: "Blog removed from bookmarks",
        bookmarked: false,
      });
    } else {
      // Add bookmark
      await prisma.bookmark.create({
        data: {
          userId,
          itemId: id,
          type: "BLOG",
        },
      });

      res.status(200).json({
        success: true,
        message: "Blog bookmarked",
        bookmarked: true,
      });
    }
  } catch (error) {
    console.error("Error bookmarking blog:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// ===========================================
// COMMENT CONTROLLERS
// ===========================================

export const addComment = async (req, res) => {
  try {
    const { postId, blogId, content } = req.body;
    const userId = req.user.id;

    if (!content || content.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Comment content is required",
      });
    }

    if (!postId && !blogId) {
      return res.status(400).json({
        success: false,
        message: "Either postId or blogId is required",
      });
    }

    // Get user info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, profilePicture: true },
    });

    // Create comment
    const comment = await prisma.communityComment.create({
      data: {
        content: content.trim(),
        userId,
        username: user.username,
        postId: postId || null,
        blogId: blogId || null,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            profilePicture: true,
          },
        },
      },
    });

    // Send notification to post/blog owner
    const targetId = postId || blogId;
    const targetType = postId ? "POST" : "BLOG";

    const target = await prisma[targetType.toLowerCase()].findUnique({
      where: { id: targetId },
    });

    if (target && target.userId !== userId) {
      await prisma.notification.create({
        data: {
          userId: target.userId,
          type: "comment",
          fromUserId: userId,
          fromUsername: user.username,
          content: `${
            user.username
          } commented on your ${targetType.toLowerCase()}`,
          itemId: targetId,
          itemType: targetType,
        },
      });

      // Emit real-time notification
      emitNotification(target.userId, {
        type: "comment",
        fromUser: user,
        content: `${
          user.username
        } commented on your ${targetType.toLowerCase()}`,
        itemId: targetId,
        itemType: targetType,
      });
    }

    res.status(201).json({
      success: true,
      message: "Comment added successfully",
      comment,
    });
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const updateComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    if (!content || content.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Comment content is required",
      });
    }

    const comment = await prisma.communityComment.findUnique({
      where: { id },
    });

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found",
      });
    }

    if (comment.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this comment",
      });
    }

    const updatedComment = await prisma.communityComment.update({
      where: { id },
      data: { content: content.trim() },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            profilePicture: true,
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      message: "Comment updated successfully",
      comment: updatedComment,
    });
  } catch (error) {
    console.error("Error updating comment:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const deleteComment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const comment = await prisma.communityComment.findUnique({
      where: { id },
    });

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found",
      });
    }

    if (comment.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this comment",
      });
    }

    await prisma.communityComment.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      message: "Comment deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting comment:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const likeComment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const comment = await prisma.communityComment.findUnique({
      where: { id },
    });

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found",
      });
    }

    // Check if already liked
    const existingLike = await prisma.like.findFirst({
      where: {
        userId,
        commentId: id,
      },
    });

    if (existingLike) {
      // Unlike
      await prisma.like.delete({
        where: { id: existingLike.id },
      });

      res.status(200).json({
        success: true,
        message: "Comment unliked",
        liked: false,
      });
    } else {
      // Like
      await prisma.like.create({
        data: {
          userId,
          commentId: id,
        },
      });

      // Send notification if not liking own comment
      if (comment.userId !== userId) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { username: true, profilePicture: true },
        });

        await prisma.notification.create({
          data: {
            userId: comment.userId,
            type: "like",
            fromUserId: userId,
            fromUsername: user.username,
            content: `${user.username} liked your comment`,
            itemId: id,
            itemType: "COMMENT",
          },
        });

        // Emit real-time notification
        emitNotification(comment.userId, {
          type: "like",
          fromUser: user,
          content: `${user.username} liked your comment`,
          itemId: id,
          itemType: "COMMENT",
        });
      }

      res.status(200).json({
        success: true,
        message: "Comment liked",
        liked: true,
      });
    }
  } catch (error) {
    console.error("Error liking comment:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// ===========================================
// USER INTERACTION CONTROLLERS
// ===========================================

export const followUser = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (userId === id) {
      return res.status(400).json({
        success: false,
        message: "You cannot follow yourself",
      });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const existingFollow = await prisma.follower.findFirst({
      where: {
        followerId: userId,
        followingId: id,
      },
    });

    if (existingFollow) {
      // Unfollow
      await prisma.follower.delete({
        where: { id: existingFollow.id },
      });
      // Get updated follower count
      const updatedFollowerCount = await prisma.follower.count({
        where: { followingId: id },
      });
      console.log("Sending follow response:", {
        success: true,
        following: false,
        message: "User unfollowed",
        followerCount: updatedFollowerCount,
      });
      return res.status(200).json({
        success: true,
        following: false,
        message: "User unfollowed",
        followerCount: updatedFollowerCount,
      });
    } else {
      // Follow
      await prisma.follower.create({
        data: {
          followerId: userId,
          followingId: id,
        },
      });
      // Get updated follower count
      const updatedFollowerCount = await prisma.follower.count({
        where: { followingId: id },
      });
      console.log("Sending follow response:", {
        success: true,
        following: true,
        message: "User followed",
        followerCount: updatedFollowerCount,
      });
      return res.status(200).json({
        success: true,
        following: true,
        message: "User followed",
        followerCount: updatedFollowerCount,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getSuggestedUsers = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get users that the current user is not following
    const followingIds = await prisma.follower.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });

    const followingIdsArray = followingIds.map((f) => f.followingId);

    const suggestedUsers = await prisma.user.findMany({
      where: {
        id: {
          not: userId,
          notIn: followingIdsArray,
        },
      },
      skip,
      take: limit,
      select: {
        id: true,
        username: true,
        profilePicture: true,
        bio: true,
        _count: {
          select: {
            followers: true,
            following: true,
            posts: true,
            blogs: true,
          },
        },
      },
    });

    const totalUsers = await prisma.user.count({
      where: {
        id: {
          not: userId,
          notIn: followingIdsArray,
        },
      },
    });

    const totalPages = Math.ceil(totalUsers / limit);

    res.status(200).json({
      success: true,
      users: suggestedUsers,
      pagination: {
        currentPage: page,
        totalPages,
        totalUsers,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching suggested users:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getUserBookmarks = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const type = req.query.type; // 'POST' or 'BLOG'

    const where = { userId };
    if (type) where.type = type;

    const bookmarks = await prisma.bookmark.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        post: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                profilePicture: true,
              },
            },
            comments: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    profilePicture: true,
                  },
                },
              },
              orderBy: { createdAt: "desc" },
            },
            likes: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    profilePicture: true,
                  },
                },
              },
            },
          },
        },
        blog: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                profilePicture: true,
              },
            },
            comments: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    profilePicture: true,
                  },
                },
              },
              orderBy: { createdAt: "desc" },
            },
            likes: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    profilePicture: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const totalBookmarks = await prisma.bookmark.count({ where });
    const totalPages = Math.ceil(totalBookmarks / limit);

    res.status(200).json({
      success: true,
      bookmarks,
      pagination: {
        currentPage: page,
        totalPages,
        totalBookmarks,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching bookmarks:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Get trending posts and blogs
export const getTrendingContent = async (req, res) => {
  try {
    const { page = 1, limit = 10, type = "all" } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let trendingContent = [];
    let total = 0;

    if (type === "posts" || type === "all") {
      const [posts, postsCount] = await Promise.all([
        prisma.post.findMany({
          skip: type === "all" ? skip : 0,
          take: type === "all" ? parseInt(limit) : parseInt(limit) / 2,
          orderBy: [
            { likes: { _count: "desc" } },
            { comments: { _count: "desc" } },
            { createdAt: "desc" },
          ],
          include: {
            user: {
              select: {
                id: true,
                username: true,
                profilePicture: true,
              },
            },
            comments: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    profilePicture: true,
                  },
                },
              },
              orderBy: { createdAt: "desc" },
            },
            likes: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    profilePicture: true,
                  },
                },
              },
            },
          },
        }),
        prisma.post.count(),
      ]);

      if (type === "posts") {
        trendingContent = posts;
        total = postsCount;
      } else {
        trendingContent.push(
          ...posts.map((post) => ({ ...post, type: "post" }))
        );
      }
    }

    if (type === "blogs" || type === "all") {
      const [blogs, blogsCount] = await Promise.all([
        prisma.blog.findMany({
          skip: type === "all" ? skip : 0,
          take: type === "all" ? parseInt(limit) : parseInt(limit) / 2,
          orderBy: [
            { likes: { _count: "desc" } },
            { comments: { _count: "desc" } },
            { createdAt: "desc" },
          ],
          include: {
            user: {
              select: {
                id: true,
                username: true,
                profilePicture: true,
              },
            },
            comments: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    profilePicture: true,
                  },
                },
              },
              orderBy: { createdAt: "desc" },
            },
            likes: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    profilePicture: true,
                  },
                },
              },
            },
          },
        }),
        prisma.blog.count(),
      ]);

      if (type === "blogs") {
        trendingContent = blogs;
        total = blogsCount;
      } else {
        trendingContent.push(
          ...blogs.map((blog) => ({ ...blog, type: "blog" }))
        );
      }
    }

    // Sort combined content by engagement (likes + comments)
    if (type === "all") {
      trendingContent.sort((a, b) => {
        const aEngagement = a.likes.length + a.comments.length;
        const bEngagement = b.likes.length + b.comments.length;
        return bEngagement - aEngagement;
      });
      total = trendingContent.length;
    }

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: trendingContent,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        total,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching trending content:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Get recommended content for discovery
export const getDiscoveryContent = async (req, res) => {
  try {
    const { page = 1, limit = 10, category } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let where = {};
    if (category) {
      where.category = category;
    }

    // Get posts and blogs with category filter
    const [posts, blogs] = await Promise.all([
      prisma.post.findMany({
        where,
        skip: skip / 2,
        take: parseInt(limit) / 2,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              profilePicture: true,
            },
          },
          comments: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  profilePicture: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
          },
          likes: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  profilePicture: true,
                },
              },
            },
          },
        },
      }),
      prisma.blog.findMany({
        where,
        skip: skip / 2,
        take: parseInt(limit) / 2,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              profilePicture: true,
            },
          },
          comments: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  profilePicture: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
          },
          likes: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  profilePicture: true,
                },
              },
            },
          },
        },
      }),
    ]);

    // Combine and shuffle content for discovery
    const discoveryContent = [
      ...posts.map((post) => ({ ...post, type: "post" })),
      ...blogs.map((blog) => ({ ...blog, type: "blog" })),
    ].sort(() => Math.random() - 0.5);

    const total = await Promise.all([
      prisma.post.count({ where }),
      prisma.blog.count({ where }),
    ]).then(([postCount, blogCount]) => postCount + blogCount);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: discoveryContent,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        total,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching discovery content:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
