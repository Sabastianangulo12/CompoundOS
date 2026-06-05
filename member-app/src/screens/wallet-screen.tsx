import { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import {
  Card,
  PrimaryButton,
  ScreenScroll,
  SectionTitle,
  SecondaryButton,
  TextField
} from "../components/ui";
import type { MemberAppContext } from "../lib/member";
import {
  authenticateWalletWithBiometrics,
  calculateWalletTotal,
  confirmWalletPurchase,
  createUnlockSession,
  fetchUnlockSession,
  fetchWalletProducts,
  formatWalletCurrency,
  getSavedWalletPin,
  saveWalletPin,
  type FridgeUnlockSessionRecord,
  type WalletProduct,
  type WalletSelectedItem,
  type WalletReceipt
} from "../lib/wallet";
import { colors } from "../theme";

type WalletScreenProps = {
  memberContext: MemberAppContext;
};

const libraryFolders = [
  { key: "drinks_fridge", label: "Drinks Fridge" },
  { key: "meal_prep_fridge", label: "Meal Prep Fridge" },
  { key: "protein_candy", label: "Protein/Candy" },
  { key: "tclc_merch", label: "TCLC Merch" }
] as const;

export function WalletScreen({ memberContext }: WalletScreenProps) {
  const [isGateReady, setIsGateReady] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [walletPin, setWalletPin] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [newPinInput, setNewPinInput] = useState("");
  const [products, setProducts] = useState<WalletProduct[]>([]);
  const [walletSession, setWalletSession] = useState<FridgeUnlockSessionRecord | null>(null);
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({});
  const [receipt, setReceipt] = useState<WalletReceipt | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [openLibraries, setOpenLibraries] = useState<Record<string, boolean>>({
    drinks_fridge: true,
    meal_prep_fridge: false,
    protein_candy: false,
    tclc_merch: false
  });

  useEffect(() => {
    void getSavedWalletPin().then((pin) => {
      setWalletPin(pin);
      setIsGateReady(true);
    });
  }, []);

  useEffect(() => {
    if (!isUnlocked) {
      return;
    }

    let isMounted = true;

    async function loadProducts() {
      setLoadingProducts(true);
      const result = await fetchWalletProducts(memberContext);

      if (!isMounted) {
        return;
      }

      if (result.error) {
        setActionMessage(result.error.message);
        setProducts([]);
      } else {
        setProducts(result.data ?? []);
      }

      setLoadingProducts(false);
    }

    void loadProducts();

    return () => {
      isMounted = false;
    };
  }, [isUnlocked, memberContext]);

  useEffect(() => {
    if (!walletSession) {
      setRemainingSeconds(null);
      return;
    }

    const currentSession = walletSession;

    function updateCountdown() {
      const seconds = Math.max(
        0,
        Math.floor((new Date(currentSession.expires_at).getTime() - Date.now()) / 1000)
      );
      setRemainingSeconds(seconds);
    }

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);

    return () => clearInterval(timer);
  }, [walletSession]);

  useEffect(() => {
    if (!walletSession || walletSession.status !== "pending") {
      return;
    }

    const timer = setInterval(() => {
      void fetchUnlockSession(walletSession.id).then((result) => {
        if (result.data) {
          setWalletSession(result.data);
        }
      });
    }, 4000);

    return () => clearInterval(timer);
  }, [walletSession]);

  const selectedItemRows = useMemo(
    () =>
      products
        .map((product) => ({
          product,
          quantity: selectedItems[product.id] ?? 0
        }))
        .filter((item) => item.quantity > 0),
    [products, selectedItems]
  );
  const selectedItemPayload: WalletSelectedItem[] = selectedItemRows.map((item) => ({
    productId: item.product.id,
    quantity: item.quantity
  }));
  const totalCents = calculateWalletTotal(products, selectedItemPayload);
  const sessionItemPayload: WalletSelectedItem[] = useMemo(
    () =>
      (walletSession?.selected_items ?? []).map((item) => ({
        productId: item.product_id,
        quantity: item.quantity
      })),
    [walletSession]
  );
  const showWalletModal = Boolean(walletSession);

  async function handleBiometricUnlock() {
    const result = await authenticateWalletWithBiometrics();

    if (!result.success) {
      setActionMessage(result.reason ?? "Biometric unlock failed.");
      return;
    }

    setActionMessage(null);
    setIsUnlocked(true);
  }

  async function handlePinUnlock() {
    if (!walletPin) {
      if (!/^\d{4,6}$/.test(newPinInput)) {
        setActionMessage("Create a 4 to 6 digit wallet PIN.");
        return;
      }

      await saveWalletPin(newPinInput);
      setWalletPin(newPinInput);
      setNewPinInput("");
      setActionMessage(null);
      setIsUnlocked(true);
      return;
    }

    if (pinInput !== walletPin) {
      setActionMessage("That PIN does not match.");
      return;
    }

    setActionMessage(null);
    setPinInput("");
    setIsUnlocked(true);
  }

  async function handleUnlockFridge() {
    if (selectedItemPayload.length === 0) {
      setActionMessage("Choose at least one item before generating your payment QR.");
      return;
    }

    setSubmitting(true);
    const result = await createUnlockSession(selectedItemPayload);
    setSubmitting(false);

    if (result.error || !result.data) {
      setActionMessage(result.error?.message ?? "Payment QR could not be created.");
      return;
    }

    setActionMessage("Payment QR created. Scan it at the front desk to continue.");
    setWalletSession(result.data);
    setReceipt(null);
  }

  async function handleConfirmPurchase() {
    if (!walletSession) {
      return;
    }

    setSubmitting(true);
    const result = await confirmWalletPurchase({
      sessionId: walletSession.id,
      selectedItems: sessionItemPayload
    });
    setSubmitting(false);

    if (result.error || !result.data) {
      Alert.alert("Purchase failed", result.error?.message ?? "Payment failed.");
      return;
    }

    setReceipt(result.data.receipt);
    setWalletSession((current) =>
      current
        ? {
            ...current,
            status: "confirmed"
          }
        : current
    );
    setActionMessage(`Purchase confirmed. Charged ${result.data.subtotal}.`);
  }

  function adjustQuantity(productId: string, delta: number) {
    setSelectedItems((current) => {
      const nextQuantity = Math.max(0, (current[productId] ?? 0) + delta);

      return {
        ...current,
        [productId]: nextQuantity
      };
    });
  }

  function toggleLibrary(folderKey: string) {
    setOpenLibraries((current) => ({
      ...current,
      [folderKey]: !current[folderKey]
    }));
  }

  function resetWalletSession() {
    setWalletSession(null);
    setReceipt(null);
    setSelectedItems({});
    setRemainingSeconds(null);
    setActionMessage(null);
  }

  return (
    <ScreenScroll>
      <SectionTitle
        title="Smart Fridge Wallet"
        subtitle="Unlock with Face ID or PIN, build your cart, then show a payment QR at the front desk scanner."
      />

      {!isGateReady ? (
        <Card>
          <Text style={{ color: colors.muted, fontSize: 14 }}>Preparing wallet...</Text>
        </Card>
      ) : !isUnlocked ? (
        <Card>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: "700" }}>
            Unlock your wallet
          </Text>
          <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>
            {walletPin
              ? "Use Face ID if available, or enter your wallet PIN."
              : "Create a wallet PIN before entering Smart Fridge Wallet."}
          </Text>
          {walletPin ? (
            <>
              <SecondaryButton
                label="Use Face ID"
                onPress={() => {
                  void handleBiometricUnlock();
                }}
              />
              <TextField
                keyboardType="numeric"
                label="Wallet PIN"
                onChangeText={setPinInput}
                placeholder="Enter PIN"
                value={pinInput}
              />
            </>
          ) : (
            <TextField
              keyboardType="numeric"
              label="Create wallet PIN"
              onChangeText={setNewPinInput}
              placeholder="4 to 6 digits"
              value={newPinInput}
            />
          )}
          {actionMessage ? (
            <Text style={{ color: colors.muted, fontSize: 13 }}>{actionMessage}</Text>
          ) : null}
          <PrimaryButton
            label={walletPin ? "Unlock Wallet" : "Save PIN and continue"}
            onPress={() => {
              void handlePinUnlock();
            }}
          />
        </Card>
      ) : (
        <>
          <Card>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: "700" }}>
              Product library
            </Text>
            <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>
              Current products for {memberContext.gym?.name ?? "your gym"}.
            </Text>
            <View style={{ gap: 12 }}>
              {libraryFolders.map((folder) => {
                const folderProducts = products.filter(
                  (product) => product.category === folder.key
                );
                const isOpen = openLibraries[folder.key];

                return (
                  <View
                    key={folder.key}
                    style={{
                      borderRadius: 22,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.panelElevated,
                      overflow: "hidden"
                    }}
                  >
                    <Pressable
                      onPress={() => toggleLibrary(folder.key)}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 15,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12
                      }}
                    >
                      <View style={{ gap: 4, flex: 1 }}>
                        <Text
                          style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}
                        >
                          {folder.label}
                        </Text>
                        <Text style={{ color: colors.muted, fontSize: 13 }}>
                          {folderProducts.length} item
                          {folderProducts.length === 1 ? "" : "s"} available
                        </Text>
                      </View>
                      <Text
                        style={{
                          color: colors.text,
                          fontSize: 18,
                          fontWeight: "700"
                        }}
                      >
                        {isOpen ? "−" : "+"}
                      </Text>
                    </Pressable>

                    {isOpen ? (
                      <View
                        style={{
                          borderTopWidth: 1,
                          borderTopColor: colors.border,
                          padding: 14,
                          gap: 12
                        }}
                      >
                        {loadingProducts ? (
                          <Text style={{ color: colors.muted, fontSize: 14 }}>
                            Loading fridge items...
                          </Text>
                        ) : folderProducts.length === 0 ? (
                          <Text style={{ color: colors.muted, fontSize: 14 }}>
                            No products are assigned to this folder yet.
                          </Text>
                        ) : (
                          folderProducts.map((product) => {
                            const quantity = selectedItems[product.id] ?? 0;

                            return (
                              <View
                                key={product.id}
                                style={{
                                  borderRadius: 20,
                                  borderWidth: 1,
                                  borderColor: colors.border,
                                  backgroundColor: colors.panel,
                                  padding: 14,
                                  gap: 10
                                }}
                              >
                                <View
                                  style={{
                                    flexDirection: "row",
                                    justifyContent: "space-between",
                                    alignItems: "flex-start",
                                    gap: 12
                                  }}
                                >
                                  <View style={{ flex: 1, gap: 4 }}>
                                    <Text
                                      style={{
                                        color: colors.text,
                                        fontSize: 16,
                                        fontWeight: "600"
                                      }}
                                    >
                                      {product.name}
                                    </Text>
                                    {product.description ? (
                                      <Text style={{ color: colors.muted, fontSize: 13 }}>
                                        {product.description}
                                      </Text>
                                    ) : null}
                                  </View>
                                  <Text
                                    style={{
                                      color: colors.text,
                                      fontSize: 15,
                                      fontWeight: "700"
                                    }}
                                  >
                                    {formatWalletCurrency(product.price_cents)}
                                  </Text>
                                </View>
                                <View
                                  style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    justifyContent: "space-between"
                                  }}
                                >
                                  <SecondaryButton
                                    label="-"
                                    onPress={() => adjustQuantity(product.id, -1)}
                                  />
                                  <Text
                                    style={{
                                      color: colors.text,
                                      fontSize: 18,
                                      fontWeight: "700"
                                    }}
                                  >
                                    {quantity}
                                  </Text>
                                  <SecondaryButton
                                    label="+"
                                    onPress={() => adjustQuantity(product.id, 1)}
                                  />
                                </View>
                              </View>
                            );
                          })
                        )}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>

            <View
              style={{
                borderRadius: 20,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.background,
                padding: 14,
                gap: 10
              }}
            >
              <Text style={{ color: colors.muted, fontSize: 13 }}>Estimated total</Text>
              <Text style={{ color: colors.text, fontSize: 28, fontWeight: "700" }}>
                {formatWalletCurrency(totalCents)}
              </Text>
              <PrimaryButton
                disabled={submitting || totalCents <= 0}
                label={
                  submitting
                    ? "Creating unlock..."
                    : `Show Payment QR (${formatWalletCurrency(totalCents)})`
                }
                onPress={() => {
                  void handleUnlockFridge();
                }}
              />
            </View>
          </Card>

          {actionMessage ? (
            <Text style={{ color: colors.muted, fontSize: 13 }}>{actionMessage}</Text>
          ) : null}
        </>
      )}

      <Modal
        animationType="fade"
        onRequestClose={() => {
          if (walletSession?.status === "confirmed" || walletSession?.status === "expired") {
            resetWalletSession();
          }
        }}
        transparent
        visible={showWalletModal}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(8,10,14,0.84)",
            alignItems: "center",
            justifyContent: "center",
            padding: 24
          }}
        >
          {walletSession ? (
            <View
              style={{
                width: "100%",
                maxWidth: 420,
                borderRadius: 28,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.panel,
                padding: 22,
                gap: 18
              }}
            >
              {walletSession.status === "pending" ? (
                <>
                  <View style={{ gap: 6, alignItems: "center" }}>
                    <Text
                      style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}
                    >
                      Scan to Pay
                    </Text>
                    <Text
                      style={{
                        color: colors.muted,
                        fontSize: 14,
                        lineHeight: 20,
                        textAlign: "center"
                      }}
                    >
                      Show this code at the front desk scanner. Your card is not charged until you confirm.
                    </Text>
                  </View>
                  <View style={{ alignItems: "center", gap: 12 }}>
                    <View
                      style={{
                        borderRadius: 28,
                        backgroundColor: "#ffffff",
                        padding: 18
                      }}
                    >
                      <QRCode size={220} value={walletSession.qr_token} />
                    </View>
                    <Text
                      style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}
                    >
                      {remainingSeconds !== null
                        ? `${remainingSeconds}s remaining`
                        : "Waiting for scan"}
                    </Text>
                  </View>
                </>
              ) : null}

              {walletSession.status === "unlocked" ? (
                <>
                  <View style={{ gap: 6 }}>
                    <Text
                      style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}
                    >
                      Confirm and Pay
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>
                      Your payment QR was scanned. Review the items below and charge the
                      card on file to finish checkout.
                    </Text>
                  </View>
                  <View style={{ gap: 10 }}>
                    {walletSession.selected_items.map((item) => (
                      <View
                        key={`${item.product_id}-${item.name}`}
                        style={{
                          borderRadius: 18,
                          borderWidth: 1,
                          borderColor: colors.border,
                          backgroundColor: colors.panelElevated,
                          padding: 14,
                          gap: 6
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 12
                          }}
                        >
                          <Text
                            style={{
                              color: colors.text,
                              fontSize: 15,
                              fontWeight: "600",
                              flex: 1
                            }}
                          >
                            {item.name}
                          </Text>
                          <Text
                            style={{
                              color: colors.text,
                              fontSize: 14,
                              fontWeight: "700"
                            }}
                          >
                            {formatWalletCurrency(item.total_price_cents)}
                          </Text>
                        </View>
                        <Text style={{ color: colors.muted, fontSize: 13 }}>
                          {item.quantity} x {formatWalletCurrency(item.unit_price_cents)}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <View
                    style={{
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                      padding: 14,
                      gap: 6
                    }}
                  >
                    <Text style={{ color: colors.muted, fontSize: 13 }}>Total</Text>
                    <Text style={{ color: colors.text, fontSize: 28, fontWeight: "700" }}>
                      {formatWalletCurrency(walletSession.estimated_total_cents)}
                    </Text>
                  </View>
                  <PrimaryButton
                    disabled={submitting}
                    label={submitting ? "Charging..." : "Confirm and Pay"}
                    onPress={() => {
                      void handleConfirmPurchase();
                    }}
                  />
                </>
              ) : null}

              {walletSession.status === "confirmed" ? (
                <>
                  <View style={{ gap: 6 }}>
                    <Text
                      style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}
                    >
                      Purchase Confirmed
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>
                      Your card on file has been charged and the receipt has been saved.
                    </Text>
                  </View>
                  <View
                    style={{
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                      padding: 14,
                      gap: 8
                    }}
                  >
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>
                      Receipt saved
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 13 }}>
                      Payment status: {receipt?.status ?? "confirmed"}
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 13 }}>
                      Total: {formatWalletCurrency(receipt?.amount_cents ?? walletSession.estimated_total_cents)}
                    </Text>
                  </View>
                  <PrimaryButton label="Done" onPress={resetWalletSession} />
                </>
              ) : null}

              {walletSession.status === "expired" || walletSession.status === "canceled" ? (
                <>
                  <View style={{ gap: 6 }}>
                    <Text
                      style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}
                    >
                      Session Ended
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>
                      This payment session is no longer active. Start a new checkout when you are ready.
                    </Text>
                  </View>
                  <PrimaryButton label="Close" onPress={resetWalletSession} />
                </>
              ) : null}

              {walletSession.status === "pending" ? (
                <Pressable
                  onPress={resetWalletSession}
                  style={{ alignSelf: "center", paddingVertical: 6, paddingHorizontal: 12 }}
                >
                  <Text style={{ color: colors.muted, fontSize: 13 }}>Hide for now</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </Modal>
    </ScreenScroll>
  );
}

function formatSessionStatus(
  status: FridgeUnlockSessionRecord["status"]
) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}
