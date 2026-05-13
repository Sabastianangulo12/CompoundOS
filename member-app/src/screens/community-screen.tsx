import { useEffect, useMemo, useState } from "react";
import { Alert, Image, Pressable, Text, View } from "react-native";
import {
  Card,
  PrimaryButton,
  ScreenScroll,
  SectionTitle,
  SecondaryButton,
  TextField
} from "../components/ui";
import {
  acceptFriendRequest,
  blockMember,
  createCommunityPost,
  createPostComment,
  fetchCommunityFeed,
  fetchFriendRequests,
  getReactionCounts,
  reactToPost,
  reportMember,
  searchGymMembers,
  sendFriendRequest,
  type CommunityPostVisibility,
  type CommunityMemberPreview,
  type CommunityPostRecord,
  type FriendRequestRecord,
  type PostReaction
} from "../lib/community";
import type { MemberAppContext } from "../lib/member";
import { colors } from "../theme";

const FEED_FILTERS = [
  { label: "All", value: "all" },
  { label: "Friends", value: "friends_only" },
  { label: "Gym feed", value: "gym_feed" }
] as const;

const POST_VISIBILITY_OPTIONS: Array<{
  label: string;
  value: CommunityPostVisibility;
}> = [
  { label: "Friends only", value: "friends_only" },
  { label: "Gym feed", value: "gym_feed" }
];

const REACTIONS: PostReaction[] = ["🔥", "💪", "👏"];

export function CommunityScreen({
  memberContext
}: {
  memberContext: MemberAppContext;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CommunityMemberPreview[]>([]);
  const [requests, setRequests] = useState<FriendRequestRecord[]>([]);
  const [posts, setPosts] = useState<CommunityPostRecord[]>([]);
  const [postBody, setPostBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [postVisibility, setPostVisibility] =
    useState<CommunityPostVisibility>("friends_only");
  const [feedFilter, setFeedFilter] =
    useState<(typeof FEED_FILTERS)[number]["value"]>("all");
  const [loading, setLoading] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    void loadCommunity();
  }, [memberContext.member.id]);

  async function loadCommunity() {
    setLoading(true);
    const [requestsResult, postsResult] = await Promise.all([
      fetchFriendRequests(memberContext.member.id),
      fetchCommunityFeed()
    ]);
    setLoading(false);

    if (requestsResult.error) {
      Alert.alert("Community error", requestsResult.error.message);
      return;
    }

    if (postsResult.error) {
      Alert.alert("Community error", postsResult.error.message);
      return;
    }

    setRequests(requestsResult.data ?? []);
    setPosts(postsResult.data ?? []);
  }

  const filteredPosts = useMemo(() => {
    if (feedFilter === "all") {
      return posts;
    }

    return posts.filter((post) => post.visibility === feedFilter);
  }, [feedFilter, posts]);

  async function handleSearch() {
    const result = await searchGymMembers(search);

    if (result.error) {
      Alert.alert("Search failed", result.error.message);
      return;
    }

    setResults(result.data);
  }

  async function handleCreatePost() {
    const result = await createCommunityPost(postBody, imageUrl, postVisibility);

    if (result.error) {
      Alert.alert("Post not created", result.error.message);
      return;
    }

    setPostBody("");
    setImageUrl("");
    setPostVisibility("friends_only");
    await loadCommunity();
  }

  async function handleSendRequest(memberId: string) {
    const result = await sendFriendRequest(memberId);

    if (result.error) {
      Alert.alert("Request failed", result.error.message);
      return;
    }

    await loadCommunity();
  }

  async function handleAcceptRequest(requestId: string) {
    const result = await acceptFriendRequest(requestId);

    if (result.error) {
      Alert.alert("Accept failed", result.error.message);
      return;
    }

    await loadCommunity();
  }

  async function handleReact(postId: string, reaction: PostReaction) {
    const result = await reactToPost(postId, reaction);

    if (result.error) {
      Alert.alert("Reaction failed", result.error.message);
      return;
    }

    await loadCommunity();
  }

  async function handleComment(postId: string) {
    const comment = commentDrafts[postId]?.trim() ?? "";

    if (!comment) {
      return;
    }

    const result = await createPostComment(postId, comment);

    if (result.error) {
      Alert.alert("Comment failed", result.error.message);
      return;
    }

    setCommentDrafts((current) => ({
      ...current,
      [postId]: ""
    }));
    await loadCommunity();
  }

  async function handleBlock(memberId: string) {
    const result = await blockMember(memberId);

    if (result.error) {
      Alert.alert("Block failed", result.error.message);
      return;
    }

    await loadCommunity();
  }

  async function handleReport(memberId: string) {
    const result = await reportMember(memberId, "Reported from member community");

    if (result.error) {
      Alert.alert("Report failed", result.error.message);
      return;
    }

    Alert.alert("Report sent", "Thanks. We'll review it.");
  }

  const incomingRequests = requests.filter(
    (request) =>
      request.receiver_member_id === memberContext.member.id &&
      request.status === "pending"
  );
  const acceptedFriendIds = new Set(
    requests.flatMap((request) => {
      if (request.status !== "accepted") {
        return [];
      }

      if (request.sender_member_id === memberContext.member.id) {
        return [request.receiver_member_id];
      }

      if (request.receiver_member_id === memberContext.member.id) {
        return [request.sender_member_id];
      }

      return [];
    })
  );

  return (
    <ScreenScroll>
      <SectionTitle
        title="Community"
        subtitle="Private by default, gym-scoped, and built around real member connections."
      />

      <Card>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: "700" }}>
          Add a friend
        </Text>
        <TextField
          autoCapitalize="none"
          label="Search gym members"
          onChangeText={setSearch}
          placeholder="Search by name or email"
          value={search}
        />
        <SecondaryButton label="Search" onPress={() => void handleSearch()} />
        {results.length > 0 ? (
          <View style={{ gap: 10 }}>
            {results.map((member) => (
              <View
                key={member.id}
                style={{
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.panelElevated,
                  padding: 14,
                  gap: 8
                }}
              >
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
                  {member.first_name} {member.last_name}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 13 }}>{member.email}</Text>
                <SecondaryButton
                  label="Send request"
                  onPress={() => void handleSendRequest(member.id)}
                />
              </View>
            ))}
          </View>
        ) : null}
      </Card>

      <Card>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: "700" }}>
          Friend requests
        </Text>
        {incomingRequests.length === 0 ? (
          <Text style={{ color: colors.muted, fontSize: 14 }}>
            No pending requests.
          </Text>
        ) : (
          incomingRequests.map((request) => (
            <View
              key={request.id}
              style={{
                borderRadius: 18,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.panelElevated,
                padding: 14,
                gap: 8
              }}
            >
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
                {request.sender_member?.first_name} {request.sender_member?.last_name}
              </Text>
              <PrimaryButton
                label="Accept"
                onPress={() => void handleAcceptRequest(request.id)}
              />
            </View>
          ))
        )}
      </Card>

      <Card>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: "700" }}>
          New post
        </Text>
        <TextField
          autoCapitalize="sentences"
          label="Post"
          multiline
          onChangeText={setPostBody}
          placeholder="Share a quick update"
          value={postBody}
        />
        <TextField
          autoCapitalize="none"
          label="Photo URL"
          onChangeText={setImageUrl}
          placeholder="Optional image URL"
          value={imageUrl}
        />
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
            Visibility
          </Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {POST_VISIBILITY_OPTIONS.map((option) => {
              const isActive = option.value === postVisibility;

              return (
                <Pressable
                  key={option.value}
                  onPress={() => setPostVisibility(option.value)}
                  style={{
                    flex: 1,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: isActive ? colors.accent : colors.border,
                    backgroundColor: isActive ? colors.panelElevated : colors.panel,
                    paddingVertical: 12,
                    paddingHorizontal: 14
                  }}
                >
                  <Text
                    style={{
                      color: isActive ? colors.text : colors.muted,
                      fontSize: 13,
                      fontWeight: "600",
                      textAlign: "center"
                    }}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <PrimaryButton
          disabled={!postBody.trim() && !imageUrl.trim()}
          label="Post"
          onPress={() => void handleCreatePost()}
        />
      </Card>

      <Card>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: "700" }}>
          Community feed
        </Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {FEED_FILTERS.map((filter) => {
            const isActive = feedFilter === filter.value;

            return (
              <Pressable
                key={filter.value}
                onPress={() => setFeedFilter(filter.value)}
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: isActive ? colors.accent : colors.border,
                  backgroundColor: isActive ? colors.panelElevated : colors.panel,
                  paddingHorizontal: 14,
                  paddingVertical: 10
                }}
              >
                <Text
                  style={{
                    color: isActive ? colors.text : colors.muted,
                    fontSize: 13,
                    fontWeight: "600"
                  }}
                >
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {loading ? (
          <Text style={{ color: colors.muted, fontSize: 14 }}>Loading community...</Text>
        ) : filteredPosts.length === 0 ? (
          <Text style={{ color: colors.muted, fontSize: 14 }}>
            No posts yet for this view. Friends-only stays private, and gym feed is opt-in.
          </Text>
        ) : (
          <View style={{ gap: 14 }}>
            {filteredPosts.map((post) => {
              const reactionCounts = getReactionCounts(post.post_likes);
              const currentReaction =
                post.post_likes.find((like) => like.member_id === memberContext.member.id)
                  ?.reaction ?? null;
              const visibilityLabel =
                post.visibility === "gym_feed" ? "Gym feed" : "Friends only";
              const milestoneStreak =
                typeof post.metadata?.streak === "number" ? post.metadata.streak : null;
              const canInteract =
                post.member_id === memberContext.member.id ||
                acceptedFriendIds.has(post.member_id);

              return (
                <View
                  key={post.id}
                  style={{
                    borderRadius: 22,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.panelElevated,
                    padding: 14,
                    gap: 10
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}
                  >
                    <View style={{ gap: 4 }}>
                      <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>
                        {post.members?.first_name} {post.members?.last_name}
                      </Text>
                      <Text style={{ color: colors.muted, fontSize: 12 }}>
                        {visibilityLabel}
                        {post.is_auto_generated ? " | Milestone" : ""}
                        {milestoneStreak ? ` | ${milestoneStreak}-day streak` : ""}
                      </Text>
                    </View>
                    {post.member_id !== memberContext.member.id ? (
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <Text
                          onPress={() => void handleBlock(post.member_id)}
                          style={{ color: colors.muted, fontSize: 12 }}
                        >
                          Block
                        </Text>
                        <Text
                          onPress={() => void handleReport(post.member_id)}
                          style={{ color: colors.muted, fontSize: 12 }}
                        >
                          Report
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {post.body ? (
                    <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>
                      {post.body}
                    </Text>
                  ) : null}
                  {post.image_url ? (
                    <Image
                      source={{ uri: post.image_url }}
                      style={{
                        width: "100%",
                        height: 220,
                        borderRadius: 18,
                        backgroundColor: colors.background
                      }}
                    />
                  ) : null}
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    {new Date(post.created_at).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short"
                    })}
                  </Text>
                  {canInteract ? (
                    <>
                      <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                        {REACTIONS.map((reaction) => {
                          const isActive = currentReaction === reaction;

                          return (
                            <Pressable
                              key={reaction}
                              onPress={() => void handleReact(post.id, reaction)}
                              style={{
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: isActive ? colors.accent : colors.border,
                                backgroundColor: isActive
                                  ? colors.panelElevated
                                  : colors.background,
                                paddingHorizontal: 12,
                                paddingVertical: 10
                              }}
                            >
                              <Text
                                style={{
                                  color: colors.text,
                                  fontSize: 13,
                                  fontWeight: "600"
                                }}
                              >
                                {reaction} {reactionCounts[reaction]}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      <View style={{ gap: 8 }}>
                        {post.post_comments.map((comment) => (
                          <View
                            key={comment.id}
                            style={{
                              borderRadius: 16,
                              borderWidth: 1,
                              borderColor: colors.border,
                              backgroundColor: colors.background,
                              padding: 10,
                              gap: 4
                            }}
                          >
                            <Text
                              style={{
                                color: colors.text,
                                fontSize: 13,
                                fontWeight: "600"
                              }}
                            >
                              {comment.members?.first_name} {comment.members?.last_name}
                            </Text>
                            <Text style={{ color: colors.muted, fontSize: 13 }}>
                              {comment.body}
                            </Text>
                          </View>
                        ))}
                      </View>
                      <TextField
                        autoCapitalize="sentences"
                        label="Comment"
                        onChangeText={(value) =>
                          setCommentDrafts((current) => ({
                            ...current,
                            [post.id]: value
                          }))
                        }
                        placeholder="Write a comment"
                        value={commentDrafts[post.id] ?? ""}
                      />
                      <SecondaryButton
                        label="Comment"
                        onPress={() => void handleComment(post.id)}
                      />
                    </>
                  ) : (
                    <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
                      Gym feed posts are visible, but reactions and comments stay limited to
                      accepted friends.
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </Card>
    </ScreenScroll>
  );
}
