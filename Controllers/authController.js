import jwt from "jsonwebtoken";
import {
  hashPassword,
  comparePassword,
  generateToken,
  generateRefreshToken,
  validateEmail,
  validatePassword,
  validateUsername,
  createErrorResponse,
  createSuccessResponse,
} from "../utils/helpers.js";
import { prisma } from "../Database-connection/index.js";
import sharp from "sharp";
import cloudinary from "../utils/cloudinary.js";

// User registration
export const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validation
    if (!username || !email || !password) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "Username, email, and password are required"
          )
        );
    }

    if (!validateUsername(username)) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "Username must be 3-20 characters long and contain only letters, numbers, and underscores"
          )
        );
    }

    if (!validateEmail(email)) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "Please provide a valid email address"
          )
        );
    }

    if (!validatePassword(password)) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "Password must be at least 8 characters long with 1 uppercase, 1 lowercase, and 1 number"
          )
        );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existingUser) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "USER_EXISTS",
            "User with this email or username already exists"
          )
        );
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const newUser = await prisma.user.create({
      data: {
        username: username || null,
        email,
        passwordHash: hashedPassword,
      },
      select: {
        id: true,
        username: true,
        email: true,
        profilePicture: true,
        bio: true,
        createdAt: true,
      },
    });

    // Generate tokens
    const accessToken = generateToken(newUser.id);
    const refreshToken = generateRefreshToken(newUser.id);

    res.status(201).json(
      createSuccessResponse(
        {
          user: newUser,
          accessToken,
          refreshToken,
        },
        "User registered successfully"
      )
    );
  } catch (error) {
    console.error("Registration error:", error);
    res
      .status(500)
      .json(
        createErrorResponse("INTERNAL_SERVER_ERROR", "Error registering user")
      );
  }
};

// User login
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "Email and password are required"
          )
        );
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res
        .status(401)
        .json(
          createErrorResponse(
            "INVALID_CREDENTIALS",
            "Invalid email or password"
          )
        );
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.passwordHash);
    if (!isPasswordValid) {
      return res
        .status(401)
        .json(
          createErrorResponse(
            "INVALID_CREDENTIALS",
            "Invalid email or password"
          )
        );
    }

    // Generate tokens
    const accessToken = generateToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    // Return user data (excluding password)
    const userData = {
      id: user.id,
      username: user.username,
      email: user.email,
      profilePicture: user.profilePicture,
      bio: user.bio,
      createdAt: user.createdAt,
    };

    res.status(200).json(
      createSuccessResponse(
        {
          user: userData,
          token: accessToken, // changed from accessToken to token
          refreshToken,
        },
        "Login successful"
      )
    );
  } catch (error) {
    console.error("Login error:", error);
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_SERVER_ERROR", "Error during login"));
  }
};

// Refresh token
export const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res
        .status(400)
        .json(
          createErrorResponse("VALIDATION_ERROR", "Refresh token is required")
        );
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        username: true,
        email: true,
        profilePicture: true,
        bio: true,
      },
    });

    if (!user) {
      return res
        .status(401)
        .json(createErrorResponse("INVALID_TOKEN", "Invalid refresh token"));
    }

    // Generate new tokens
    const newAccessToken = generateToken(user.id);
    const newRefreshToken = generateRefreshToken(user.id);

    res.status(200).json(
      createSuccessResponse(
        {
          user,
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        },
        "Token refreshed successfully"
      )
    );
  } catch (error) {
    console.error("Refresh token error:", error);
    res
      .status(401)
      .json(createErrorResponse("INVALID_TOKEN", "Invalid refresh token"));
  }
};

// Get current user
export const getCurrentUser = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        username: true,
        email: true,
        profilePicture: true,
        bio: true,
        gender: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", "User not found"));
    }

    res.status(200).json(createSuccessResponse({ user }));
  } catch (error) {
    console.error("Get current user error:", error);
    res
      .status(500)
      .json(
        createErrorResponse("INTERNAL_SERVER_ERROR", "Error fetching user data")
      );
  }
};

// Update profile
export const updateProfile = async (req, res) => {
  try {
    const { bio, gender } = req.body;
    const userId = req.user.id;
    let profilePictureUrl = req.body.profilePicture; // fallback if sent as URL

    // If a file is uploaded, process and upload to Cloudinary
    if (req.file) {
      // Optimize image using Sharp
      const optimizedImageBuffer = await sharp(req.file.buffer)
        .resize(400, 400, { fit: "cover" })
        .jpeg({ quality: 80 })
        .toBuffer();

      // Convert to data URI
      const fileUri = `data:image/jpeg;base64,${optimizedImageBuffer.toString(
        "base64"
      )}`;

      // Upload to Cloudinary
      const cloudResponse = await cloudinary.uploader.upload(fileUri, {
        folder: "finmunity/profiles",
      });

      profilePictureUrl = cloudResponse.secure_url;
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(bio !== undefined && { bio }),
        ...(gender !== undefined && { gender }),
        ...(profilePictureUrl && { profilePicture: profilePictureUrl }),
      },
      select: {
        id: true,
        username: true,
        email: true,
        profilePicture: true,
        bio: true,
        gender: true,
        createdAt: true,
      },
    });

    res
      .status(200)
      .json(
        createSuccessResponse(
          { user: updatedUser },
          "Profile updated successfully"
        )
      );
  } catch (error) {
    console.error("Update profile error:", error);
    res
      .status(500)
      .json(
        createErrorResponse("INTERNAL_SERVER_ERROR", "Error updating profile")
      );
  }
};

// Forgot password
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res
        .status(400)
        .json(createErrorResponse("VALIDATION_ERROR", "Email is required"));
    }

    if (!validateEmail(email)) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "Please provide a valid email"
          )
        );
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", "User not found"));
    }

    // TODO: Implement email sending logic
    // For now, just return success
    res
      .status(200)
      .json(
        createSuccessResponse(
          null,
          "Password reset instructions sent to your email"
        )
      );
  } catch (error) {
    console.error("Forgot password error:", error);
    res
      .status(500)
      .json(
        createErrorResponse("INTERNAL_SERVER_ERROR", "Error processing request")
      );
  }
};

// Reset password
export const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "Token and password are required"
          )
        );
    }

    if (!validatePassword(password)) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "Password must be at least 8 characters long with 1 uppercase, 1 lowercase, and 1 number"
          )
        );
    }

    // TODO: Implement token verification logic
    // For now, just return success
    res
      .status(200)
      .json(createSuccessResponse(null, "Password reset successfully"));
  } catch (error) {
    console.error("Reset password error:", error);
    res
      .status(500)
      .json(
        createErrorResponse("INTERNAL_SERVER_ERROR", "Error resetting password")
      );
  }
};

// Logout
export const logout = async (req, res) => {
  try {
    // TODO: Implement token blacklisting if needed
    res
      .status(200)
      .json(createSuccessResponse(null, "Logged out successfully"));
  } catch (error) {
    console.error("Logout error:", error);
    res
      .status(500)
      .json(
        createErrorResponse("INTERNAL_SERVER_ERROR", "Error during logout")
      );
  }
};
