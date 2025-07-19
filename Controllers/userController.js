import { PrismaClient } from "@prisma/client";
import {
  createPagination,
  createSearchQuery,
  createErrorResponse,
  createSuccessResponse,
  validateImageUrl,
} from "../utils/helpers.js";

const prisma = new PrismaClient();

// Get user profile by ID
export const getUserProfile = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        profilePicture: true,
        bio: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            posts: true,
            blogs: true,
            followers: true,
            following: true,
          },
        },
      },
    });

    if (!user) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", "User not found"));
    }

    // Check if current user is following this user
    let isFollowing = false;
    if (req.user) {
      const followRelation = await prisma.follower.findFirst({
        where: {
          followerId: req.user.id,
          followingId: id,
        },
      });
      isFollowing = !!followRelation;
    }

    res.status(200).json(
      createSuccessResponse({
        user: {
          ...user,
          isFollowing,
        },
      })
    );
  } catch (error) {
    console.error("Get user profile error:", error);
    res
      .status(500)
      .json(
        createErrorResponse(
          "INTERNAL_SERVER_ERROR",
          "Error fetching user profile"
        )
      );
  }
};

// Get posts by specific user
export const getUserPosts = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, profilePicture: true },
    });

    if (!user) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", "User not found"));
    }

    // Get user's posts with pagination
    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit),
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
          },
          likes: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                },
              },
            },
          },
        },
      }),
      prisma.post.count({ where: { userId: id } }),
    ]);

    const pagination = createPagination(page, limit, total);

    res.status(200).json(
      createSuccessResponse({
        user,
        data: posts,
        pagination,
      })
    );
  } catch (error) {
    console.error("Get user posts error:", error);
    res
      .status(500)
      .json(
        createErrorResponse(
          "INTERNAL_SERVER_ERROR",
          "Error fetching user posts"
        )
      );
  }
};

// Get blogs by specific user
export const getUserBlogs = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, profilePicture: true },
    });

    if (!user) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", "User not found"));
    }

    // Get user's blogs with pagination
    const [blogs, total] = await Promise.all([
      prisma.blog.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit),
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
          },
          likes: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                },
              },
            },
          },
        },
      }),
      prisma.blog.count({ where: { userId: id } }),
    ]);

    const pagination = createPagination(page, limit, total);

    res.status(200).json(
      createSuccessResponse({
        user,
        data: blogs,
        pagination,
      })
    );
  } catch (error) {
    console.error("Get user blogs error:", error);
    res
      .status(500)
      .json(
        createErrorResponse(
          "INTERNAL_SERVER_ERROR",
          "Error fetching user blogs"
        )
      );
  }
};

// Get user's followers
export const getUserFollowers = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true },
    });

    if (!user) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", "User not found"));
    }

    // Get followers with pagination
    const [followers, total] = await Promise.all([
      prisma.follower.findMany({
        where: { followingId: id },
        skip,
        take: parseInt(limit),
        include: {
          follower: {
            select: {
              id: true,
              username: true,
              profilePicture: true,
              bio: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.follower.count({ where: { followingId: id } }),
    ]);

    const pagination = createPagination(page, limit, total);

    res.status(200).json(
      createSuccessResponse({
        user,
        data: followers.map((f) => f.follower),
        pagination,
      })
    );
  } catch (error) {
    console.error("Get user followers error:", error);
    res
      .status(500)
      .json(
        createErrorResponse(
          "INTERNAL_SERVER_ERROR",
          "Error fetching user followers"
        )
      );
  }
};

// Get users that this user follows
export const getUserFollowing = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true },
    });

    if (!user) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", "User not found"));
    }

    // Get following with pagination
    const [following, total] = await Promise.all([
      prisma.follower.findMany({
        where: { followerId: id },
        skip,
        take: parseInt(limit),
        include: {
          following: {
            select: {
              id: true,
              username: true,
              profilePicture: true,
              bio: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.follower.count({ where: { followerId: id } }),
    ]);

    const pagination = createPagination(page, limit, total);

    res.status(200).json(
      createSuccessResponse({
        user,
        data: following.map((f) => f.following),
        pagination,
      })
    );
  } catch (error) {
    console.error("Get user following error:", error);
    res
      .status(500)
      .json(
        createErrorResponse(
          "INTERNAL_SERVER_ERROR",
          "Error fetching user following"
        )
      );
  }
};

// Follow/unfollow a user
export const followUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const userToFollow = await prisma.user.findUnique({
      where: { id },
    });

    if (!userToFollow) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", "User not found"));
    }

    // Check if trying to follow self
    if (id === req.user.id) {
      return res
        .status(400)
        .json(
          createErrorResponse("VALIDATION_ERROR", "You cannot follow yourself")
        );
    }

    // Check if already following
    const existingFollow = await prisma.follower.findFirst({
      where: {
        followerId: req.user.id,
        followingId: id,
      },
    });

    if (existingFollow) {
      // Unfollow
      await prisma.follower.delete({
        where: { id: existingFollow.id },
      });

      res
        .status(200)
        .json(createSuccessResponse(null, "User unfollowed successfully"));
    } else {
      // Follow
      await prisma.follower.create({
        data: {
          followerId: req.user.id,
          followingId: id,
        },
      });

      res
        .status(200)
        .json(createSuccessResponse(null, "User followed successfully"));
    }
  } catch (error) {
    console.error("Follow user error:", error);
    res
      .status(500)
      .json(
        createErrorResponse(
          "INTERNAL_SERVER_ERROR",
          "Error following/unfollowing user"
        )
      );
  }
};

// Update user profile
export const updateUserProfile = async (req, res) => {
  try {
    const { username, bio, profilePicture } = req.body;

    // Validation
    if (username && username.length < 3) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "Username must be at least 3 characters long"
          )
        );
    }

    if (profilePicture && !validateImageUrl(profilePicture)) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "Please provide a valid image URL"
          )
        );
    }

    // Check if username is already taken
    if (username && username !== req.user.username) {
      const existingUser = await prisma.user.findUnique({
        where: { username },
      });

      if (existingUser) {
        return res
          .status(400)
          .json(
            createErrorResponse("USERNAME_TAKEN", "Username is already taken")
          );
      }
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        ...(username && { username }),
        ...(bio !== undefined && { bio }),
        ...(profilePicture && { profilePicture }),
      },
      select: {
        id: true,
        username: true,
        email: true,
        profilePicture: true,
        bio: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(200).json(
      createSuccessResponse(
        {
          user: updatedUser,
        },
        "Profile updated successfully"
      )
    );
  } catch (error) {
    console.error("Update user profile error:", error);
    res
      .status(500)
      .json(
        createErrorResponse("INTERNAL_SERVER_ERROR", "Error updating profile")
      );
  }
};

// Get user's bookmarks
export const getUserBookmarks = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10, type = "all" } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true },
    });

    if (!user) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", "User not found"));
    }

    // Build where clause
    let where = { userId: id };
    if (type !== "all") {
      where.type = type;
    }

    // Get bookmarks with pagination
    const [bookmarks, total] = await Promise.all([
      prisma.bookmark.findMany({
        where,
        skip,
        take: parseInt(limit),
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
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.bookmark.count({ where }),
    ]);

    const pagination = createPagination(page, limit, total);

    res.status(200).json(
      createSuccessResponse({
        user,
        data: bookmarks,
        pagination,
      })
    );
  } catch (error) {
    console.error("Get user bookmarks error:", error);
    res
      .status(500)
      .json(
        createErrorResponse(
          "INTERNAL_SERVER_ERROR",
          "Error fetching user bookmarks"
        )
      );
  }
};

// Add bookmark
export const addBookmark = async (req, res) => {
  try {
    const { type, itemId } = req.body;

    // Validation
    if (!type || !itemId) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "Type and itemId are required"
          )
        );
    }

    if (!["post", "blog"].includes(type)) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            'Type must be either "post" or "blog"'
          )
        );
    }

    // Check if item exists
    let item;
    if (type === "post") {
      item = await prisma.post.findUnique({ where: { id: itemId } });
    } else {
      item = await prisma.blog.findUnique({ where: { id: itemId } });
    }

    if (!item) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", `${type} not found`));
    }

    // Check if already bookmarked
    const existingBookmark = await prisma.bookmark.findFirst({
      where: {
        userId: req.user.id,
        type,
        itemId,
      },
    });

    if (existingBookmark) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "ALREADY_BOOKMARKED",
            "Item is already bookmarked"
          )
        );
    }

    // Create bookmark
    await prisma.bookmark.create({
      data: {
        userId: req.user.id,
        type,
        itemId,
      },
    });

    res
      .status(201)
      .json(createSuccessResponse(null, "Bookmark added successfully"));
  } catch (error) {
    console.error("Add bookmark error:", error);
    res
      .status(500)
      .json(
        createErrorResponse("INTERNAL_SERVER_ERROR", "Error adding bookmark")
      );
  }
};

// Remove bookmark
export const removeBookmark = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if bookmark exists
    const bookmark = await prisma.bookmark.findUnique({
      where: { id },
    });

    if (!bookmark) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", "Bookmark not found"));
    }

    // Check if user owns the bookmark
    if (bookmark.userId !== req.user.id) {
      return res
        .status(403)
        .json(
          createErrorResponse(
            "FORBIDDEN",
            "You can only remove your own bookmarks"
          )
        );
    }

    // Delete bookmark
    await prisma.bookmark.delete({
      where: { id },
    });

    res
      .status(200)
      .json(createSuccessResponse(null, "Bookmark removed successfully"));
  } catch (error) {
    console.error("Remove bookmark error:", error);
    res
      .status(500)
      .json(
        createErrorResponse("INTERNAL_SERVER_ERROR", "Error removing bookmark")
      );
  }
};

// Get suggested users to follow
export const getSuggestedUsers = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    // Get users that the current user is not following
    const followingIds = await prisma.follower.findMany({
      where: { followerId: req.user.id },
      select: { followingId: true },
    });

    const followingIdsArray = followingIds.map((f) => f.followingId);

    const suggestedUsers = await prisma.user.findMany({
      where: {
        id: {
          not: req.user.id,
          notIn: followingIdsArray,
        },
      },
      select: {
        id: true,
        username: true,
        profilePicture: true,
        bio: true,
        _count: {
          select: {
            followers: true,
            posts: true,
            blogs: true,
          },
        },
      },
      orderBy: [
        { followers: { _count: "desc" } },
        { posts: { _count: "desc" } },
        { blogs: { _count: "desc" } },
      ],
      take: parseInt(limit),
    });

    // Add follow status (should all be false for suggested users)
    const suggestedUsersWithFollowStatus = suggestedUsers.map((user) => ({
      ...user,
      isFollowing: false,
    }));

    res.status(200).json(
      createSuccessResponse({
        users: suggestedUsersWithFollowStatus,
      })
    );
  } catch (error) {
    console.error("Get suggested users error:", error);
    res
      .status(500)
      .json(
        createErrorResponse(
          "INTERNAL_SERVER_ERROR",
          "Error fetching suggested users"
        )
      );
  }
};

// Search users by username or email
export const searchUsers = async (req, res) => {
  try {
    const { query } = req.query;
    const userId = req.user?.id;
    if (!query || query.trim().length < 2) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "Query must be at least 2 characters"
          )
        );
    }
    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: userId } },
          {
            OR: [{ username: { contains: query, mode: "insensitive" } }],
          },
        ],
      },
      select: {
        id: true,
        username: true,
        profilePicture: true,
        bio: true,
        _count: {
          select: {
            followers: true,
            posts: true,
            blogs: true,
          },
        },
      },
      take: 10,
    });

    // Add follow status for each user
    const usersWithFollowStatus = await Promise.all(
      users.map(async (user) => {
        let isFollowing = false;
        if (userId) {
          const followRelation = await prisma.follower.findFirst({
            where: {
              followerId: userId,
              followingId: user.id,
            },
          });
          isFollowing = !!followRelation;
        }
        return {
          ...user,
          isFollowing,
        };
      })
    );

    res
      .status(200)
      .json(createSuccessResponse({ users: usersWithFollowStatus }));
  } catch (error) {
    console.error("Search users error:", error);
    res
      .status(500)
      .json(
        createErrorResponse("INTERNAL_SERVER_ERROR", "Error searching users")
      );
  }
};
