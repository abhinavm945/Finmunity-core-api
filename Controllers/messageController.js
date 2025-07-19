import { PrismaClient } from "@prisma/client";
import {
  createPagination,
  createErrorResponse,
  createSuccessResponse,
} from "../utils/helpers.js";
import { emitNewMessage, emitMessageStatusUpdate } from "../socket/socket.js";

const prisma = new PrismaClient();

// Get user's conversations
export const getConversations = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const userId = req.user.id;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get conversations where user is a participant
    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where: {
          OR: [{ participant1Id: userId }, { participant2Id: userId }],
        },
        orderBy: { updatedAt: "desc" },
        skip,
        take: parseInt(limit),
        include: {
          participant1: {
            select: {
              id: true,
              username: true,
              profilePicture: true,
            },
          },
          participant2: {
            select: {
              id: true,
              username: true,
              profilePicture: true,
            },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              sender: {
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
      prisma.conversation.count({
        where: {
          OR: [{ participant1Id: userId }, { participant2Id: userId }],
        },
      }),
    ]);

    // Format conversations to show other participant and last message
    const formattedConversations = await Promise.all(
      conversations.map(async (conversation) => {
        const otherParticipant =
          conversation.participant1Id === userId
            ? conversation.participant2
            : conversation.participant1;

        const participants = [
          conversation.participant1,
          conversation.participant2,
        ];
        const lastMessage = conversation.messages[0] || null;

        // Count unread messages for this conversation for the current user
        const unreadCount = await prisma.message.count({
          where: {
            conversationId: conversation.id,
            receiverId: userId,
            isRead: false,
          },
        });

        return {
          id: conversation.id,
          participants,
          otherParticipant,
          lastMessage,
          updatedAt: conversation.updatedAt,
          unreadCount,
        };
      })
    );

    const pagination = createPagination(page, limit, total);

    res.status(200).json(
      createSuccessResponse({
        data: formattedConversations,
        pagination,
      })
    );
  } catch (error) {
    console.error("Get conversations error:", error);
    res
      .status(500)
      .json(
        createErrorResponse(
          "INTERNAL_SERVER_ERROR",
          "Error fetching conversations"
        )
      );
  }
};

// Get messages in a conversation
export const getConversationMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const userId = req.user.id;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Check if user is part of this conversation
    const conversation = await prisma.conversation.findFirst({
      where: {
        id,
        OR: [{ participant1Id: userId }, { participant2Id: userId }],
      },
    });

    if (!conversation) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", "Conversation not found"));
    }

    // Get messages with pagination
    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit),
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              profilePicture: true,
            },
          },
          receiver: {
            select: {
              id: true,
              username: true,
              profilePicture: true,
            },
          },
        },
      }),
      prisma.message.count({ where: { conversationId: id } }),
    ]);

    // Mark messages as read if they're from other user
    await prisma.message.updateMany({
      where: {
        conversationId: id,
        receiverId: userId,
        isRead: false,
      },
      data: { isRead: true },
    });

    const pagination = createPagination(page, limit, total);

    res.status(200).json(
      createSuccessResponse({
        data: messages.reverse(), // Show oldest first
        pagination,
      })
    );
  } catch (error) {
    console.error("Get conversation messages error:", error);
    res
      .status(500)
      .json(
        createErrorResponse(
          "INTERNAL_SERVER_ERROR",
          "Error fetching conversation messages"
        )
      );
  }
};

// Send message in conversation
export const sendMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    if (!content || content.trim().length === 0) {
      return res
        .status(400)
        .json(
          createErrorResponse("VALIDATION_ERROR", "Message content is required")
        );
    }

    // Check if user is part of this conversation
    const conversation = await prisma.conversation.findFirst({
      where: {
        id,
        OR: [{ participant1Id: userId }, { participant2Id: userId }],
      },
    });

    if (!conversation) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", "Conversation not found"));
    }

    // Determine receiver
    const receiverId =
      conversation.participant1Id === userId
        ? conversation.participant2Id
        : conversation.participant1Id;

    // Create message
    const message = await prisma.message.create({
      data: {
        conversationId: id,
        senderId: userId,
        receiverId,
        content: content.trim(),
        status: "sent",
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            profilePicture: true,
          },
        },
        receiver: {
          select: {
            id: true,
            username: true,
            profilePicture: true,
          },
        },
      },
    });

    // Update conversation timestamp
    await prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    // Emit newMessage to both receiver and sender
    emitNewMessage(receiverId, message);
    emitNewMessage(userId, message);

    res
      .status(201)
      .json(createSuccessResponse({ message }, "Message sent successfully"));
  } catch (error) {
    console.error("Send message error:", error);
    res
      .status(500)
      .json(
        createErrorResponse("INTERNAL_SERVER_ERROR", "Error sending message")
      );
  }
};

// Start new conversation
export const startConversation = async (req, res) => {
  try {
    const { receiverId, content } = req.body;
    const userId = req.user.id;

    if (!receiverId || !content) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "Receiver ID and message content are required"
          )
        );
    }

    if (receiverId === userId) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "Cannot start conversation with yourself"
          )
        );
    }

    // Check if receiver exists
    const receiver = await prisma.user.findUnique({
      where: { id: receiverId },
    });

    if (!receiver) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", "Receiver not found"));
    }

    // Check if conversation already exists
    let conversation = await prisma.conversation.findFirst({
      where: {
        OR: [
          {
            participant1Id: userId,
            participant2Id: receiverId,
          },
          {
            participant1Id: receiverId,
            participant2Id: userId,
          },
        ],
      },
    });

    // Create conversation if it doesn't exist
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          participant1Id: userId,
          participant2Id: receiverId,
        },
      });
    }

    // Create first message
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: userId,
        receiverId,
        content: content.trim(),
        status: "sent",
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            profilePicture: true,
          },
        },
        receiver: {
          select: {
            id: true,
            username: true,
            profilePicture: true,
          },
        },
      },
    });

    // Update conversation timestamp
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    // Emit newMessage to both receiver and sender
    emitNewMessage(receiverId, message);
    emitNewMessage(userId, message);

    res.status(201).json(
      createSuccessResponse(
        {
          conversation: {
            id: conversation.id,
            message,
          },
        },
        "Conversation started successfully"
      )
    );
  } catch (error) {
    console.error("Start conversation error:", error);
    res
      .status(500)
      .json(
        createErrorResponse(
          "INTERNAL_SERVER_ERROR",
          "Error starting conversation"
        )
      );
  }
};

// Mark message as delivered
export const markMessageDelivered = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const message = await prisma.message.findFirst({
      where: { id, receiverId: userId },
    });

    if (!message) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", "Message not found"));
    }

    const updated = await prisma.message.update({
      where: { id },
      data: { status: "delivered" },
    });

    // Emit status update to sender
    emitMessageStatusUpdate(message.senderId, message.id, "delivered");

    res
      .status(200)
      .json(createSuccessResponse({}, "Message marked as delivered"));
  } catch (error) {
    console.error("Mark message delivered error:", error);
    res
      .status(500)
      .json(
        createErrorResponse(
          "INTERNAL_SERVER_ERROR",
          "Error marking message as delivered"
        )
      );
  }
};

// Mark message as read
export const markMessageRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const message = await prisma.message.findFirst({
      where: { id, receiverId: userId },
    });

    if (!message) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", "Message not found"));
    }

    const updated = await prisma.message.update({
      where: { id },
      data: { isRead: true, status: "read" },
    });

    // Emit status update to sender
    emitMessageStatusUpdate(message.senderId, message.id, "read");

    res.status(200).json(createSuccessResponse({}, "Message marked as read"));
  } catch (error) {
    console.error("Mark message read error:", error);
    res
      .status(500)
      .json(
        createErrorResponse(
          "INTERNAL_SERVER_ERROR",
          "Error marking message as read"
        )
      );
  }
};

// Get unread message count
export const getUnreadMessageCount = async (req, res) => {
  try {
    const userId = req.user.id;

    const count = await prisma.message.count({
      where: { receiverId: userId, isRead: false },
    });

    res.status(200).json(
      createSuccessResponse({
        unreadCount: count,
      })
    );
  } catch (error) {
    console.error("Get unread message count error:", error);
    res
      .status(500)
      .json(
        createErrorResponse(
          "INTERNAL_SERVER_ERROR",
          "Error fetching unread message count"
        )
      );
  }
};

// Get last message in a conversation
export const getLastMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const message = await prisma.message.findFirst({
      where: { conversationId: id },
      orderBy: { createdAt: "desc" },
    });
    if (!message) {
      return res
        .status(404)
        .json(
          createErrorResponse(
            "NOT_FOUND",
            "No messages found for this conversation"
          )
        );
    }
    res
      .status(200)
      .json(
        createSuccessResponse({ message }, "Last message fetched successfully")
      );
  } catch (error) {
    console.error("Get last message error:", error);
    res
      .status(500)
      .json(
        createErrorResponse(
          "INTERNAL_SERVER_ERROR",
          "Error fetching last message"
        )
      );
  }
};
