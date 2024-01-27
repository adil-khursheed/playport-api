import mongoose, { isValidObjectId } from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Subscription } from "../models/subscription.model.js";
import { User } from "../models/user.model.js";

const toggleSubscription = asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  if (!isValidObjectId(channelId)) {
    throw new ApiError(400, "Invalid channel id!");
  }

  const toBeSubscribed = await User.findById(channelId);

  if (!toBeSubscribed) {
    throw new ApiError(404, "User does not exist!");
  }

  if (channelId.toString() === req.user?._id.toString()) {
    throw new ApiError(400, "You cannot subscribe yourself!");
  }

  const isAlreadySubscribed = await Subscription.findOne({
    subscriber: req.user?._id,
    channel: toBeSubscribed._id,
  });

  if (isAlreadySubscribed) {
    await Subscription.findOneAndDelete({
      subscriber: req.user?._id,
      channel: toBeSubscribed._id,
    });

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { isSubscribed: false },
          "Unsubscribed successfully!"
        )
      );
  } else {
    await Subscription.create({
      subscriber: req.user?._id,
      channel: toBeSubscribed._id,
    });

    return res
      .status(200)
      .json(
        new ApiResponse(200, { isSubscribed: true }, "Subscribed successfully!")
      );
  }
});

const getUserChannelSubscribers = asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  if (!isValidObjectId(channelId)) {
    throw new ApiError(400, "Invalid channel id!");
  }

  const userAggregation = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(channelId),
      },
    },
    {
      $project: {
        username: 1,
        fullName: 1,
        avatar: 1,
      },
    },
  ]);

  const user = userAggregation[0];
  // console.log(user);

  if (!user) {
    throw new ApiError(404, "User does not exist!");
  }

  const userId = user._id;

  const subscribersAggregation = await Subscription.aggregate([
    {
      $match: {
        channel: new mongoose.Types.ObjectId(userId),
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "subscriber",
        foreignField: "_id",
        as: "subscriber",
        pipeline: [
          {
            $lookup: {
              from: "subscriptions",
              localField: "_id",
              foreignField: "channel",
              as: "isSubscribed",
              pipeline: [
                {
                  $match: {
                    subscriber: new mongoose.Types.ObjectId(req.user?._id),
                  },
                },
              ],
            },
          },
          {
            $addFields: {
              isSubscribed: {
                $cond: {
                  if: {
                    $gte: [
                      {
                        $size: "$isSubscribed",
                      },
                      1,
                    ],
                  },
                  then: true,
                  else: false,
                },
              },
            },
          },
          {
            $project: {
              username: 1,
              fullName: 1,
              avatar: 1,
              isSubscribed: 1,
            },
          },
        ],
      },
    },
    {
      $addFields: {
        subscriber: {
          $first: "$subscriber",
        },
      },
    },
    {
      $project: {
        _id: 0,
        subscriber: 1,
      },
    },
    {
      $replaceRoot: {
        newRoot: "$subscriber",
      },
    },
  ]);

  // console.log(subscribersAggregation);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { user, ...subscribersAggregation },
        "Followers list fetched successfully!"
      )
    );
});

const getSubscribedChannels = asyncHandler(async (req, res) => {
  const { subscriberId } = req.params;

  if (!isValidObjectId(subscriberId)) {
    throw new ApiError(400, "Invalid subscriber id!");
  }

  const userAggregation = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(subscriberId),
      },
    },
    {
      $project: {
        username: 1,
        fullName: 1,
        avatar: 1,
      },
    },
  ]);

  const user = userAggregation[0];

  if (!user) {
    throw new ApiError(404, "User does not exist!");
  }

  const userId = user._id;

  const subscribedToAggregation = await Subscription.aggregate([
    {
      $match: {
        subscriber: new mongoose.Types.ObjectId(userId),
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "channel",
        foreignField: "_id",
        as: "subscribedTo",
        pipeline: [
          {
            $lookup: {
              from: "subscriptions",
              localField: "_id",
              foreignField: "channel",
              as: "isSubscribed",
              pipeline: [
                {
                  $match: {
                    subscriber: new mongoose.Types.ObjectId(req.user?._id),
                  },
                },
              ],
            },
          },
          {
            $addFields: {
              isSubscribed: {
                $cond: {
                  if: {
                    $gte: [
                      {
                        $size: "$isSubscribed",
                      },
                      1,
                    ],
                  },
                  then: true,
                  else: false,
                },
              },
            },
          },
          {
            $project: {
              username: 1,
              fullName: 1,
              avatar: 1,
              isSubscribed: 1,
            },
          },
        ],
      },
    },
    {
      $addFields: {
        subscribedTo: {
          $first: "$subscribedTo",
        },
      },
    },
    {
      $project: {
        _id: 0,
        subscribedTo: 1,
      },
    },
    {
      $replaceRoot: {
        newRoot: "$subscribedTo",
      },
    },
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { user, ...subscribedToAggregation },
        "Subscribed list fetched successfully!"
      )
    );
});

export { toggleSubscription, getSubscribedChannels, getUserChannelSubscribers };
