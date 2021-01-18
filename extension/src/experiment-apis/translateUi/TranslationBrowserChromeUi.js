/* global Services, TranslationBrowserChromeUiNotificationManager */
/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "(TranslationBrowserChromeUi)" }]*/

const TranslationInfoBarStates = {
  STATE_OFFER: 0,
  STATE_TRANSLATING: 1,
  STATE_TRANSLATED: 2,
  STATE_ERROR: 3,
  STATE_UNAVAILABLE: 4,
};

class TranslationBrowserChromeUi {
  constructor(browser, context, apiEventEmitter) {
    this.uiState = null;
    this.browser = browser;
    this.context = context;
    this.importTranslationNotification();

    // The manager instance is injected into the translation notification bar and handles events from therein
    this.translationBrowserChromeUiNotificationManager = new TranslationBrowserChromeUiNotificationManager(
      browser,
      apiEventEmitter,
    );
  }

  get defaultTargetLanguage() {
    if (!this._defaultTargetLanguage) {
      this._defaultTargetLanguage = Services.locale.appLocaleAsBCP47.split(
        "-",
      )[0];
    }
    return this._defaultTargetLanguage;
  }

  get notificationBox() {
    return this.browser.ownerGlobal.gBrowser.getNotificationBox(this.browser);
  }

  /**
   * Syncs infobarState with the inner infobar state variable of the infobar
   * @param val
   */
  setInfobarState(val) {
    const notif = this.notificationBox.getNotificationWithValue("translation");
    if (notif) {
      notif.state = val;
    }
  }

  importTranslationNotification() {
    const chromeWin = this.browser.ownerGlobal;

    // As a workaround to be able to load updates for the translation notification on extension reload
    // we use the current unix timestamp as part of the element id.
    // TODO: Restrict use of Date.now() as cachebuster to development mode only
    chromeWin.now = Date.now();

    try {
      chromeWin.customElements.setElementCreationCallback(
        `translation-notification-${chromeWin.now}`,
        () => {
          Services.scriptloader.loadSubScript(
            this.context.extension.getURL(
              "experiment-apis/translateUi/content/translation-notification.js",
            ) +
              "?cachebuster=" +
              chromeWin.now,
            chromeWin,
          );
        },
      );
    } catch (e) {
      console.log(
        "Error occurred when attempting to load the translation notification script, but we continue nevertheless",
        e,
      );
    }
  }

  onUiStateUpdate(uiState) {
    console.debug("onUiStateUpdate", { uiState });

    if (uiState.infoBarState === TranslationInfoBarStates.STATE_OFFER) {
      if (uiState.detectedLanguage === this.defaultTargetLanguage) {
        // Detected language is the same as the user's locale.
        console.info("Detected language is the same as the user's locale.");
        return;
      }

      if (
        !uiState.supportedTargetLanguages.includes(uiState.detectedLanguage)
      ) {
        // Detected language is not part of the supported languages.
        console.info(
          "Detected language is not part of the supported languages.",
        );
        return;
      }
    }

    // Set all values before showing a new translation infobar.
    this.translationBrowserChromeUiNotificationManager.uiState = uiState;
    this.setInfobarState(uiState.infoBarState);

    this.showURLBarIcon();

    if (this.shouldShowInfoBar(this.browser.contentPrincipal)) {
      this.showTranslationInfoBarIfNotAlreadyShown();
    }
  }

  /*
  translationFinished(result) {
    if (result.success) {
      this.originalShown = false;
      this.state = TranslationInfoBarStates.STATE_TRANSLATED;
      this.showURLBarIcon();
    } else {
      this.state = TranslationInfoBarStates.STATE_ERROR;
    }
  }
  */

  shouldShowInfoBar(aPrincipal) {
    // Check if we should never show the infobar for this language.
    const neverForLangs = Services.prefs.getCharPref(
      "browser.translation.neverForLanguages",
    );
    if (neverForLangs.split(",").includes(this.detectedLanguage)) {
      // TranslationTelemetry.recordAutoRejectedTranslationOffer();
      return false;
    }

    // or if we should never show the infobar for this domain.
    const perms = Services.perms;
    if (
      perms.testExactPermissionFromPrincipal(aPrincipal, "translate") ===
      perms.DENY_ACTION
    ) {
      // TranslationTelemetry.recordAutoRejectedTranslationOffer();
      return false;
    }

    return true;
  }

  showURLBarIcon() {
    const chromeWin = this.browser.ownerGlobal;
    const PopupNotifications = chromeWin.PopupNotifications;
    const removeId = this.originalShown ? "translated" : "translate";
    const notification = PopupNotifications.getNotification(
      removeId,
      this.browser,
    );
    if (notification) {
      PopupNotifications.remove(notification);
    }

    const callback = (aTopic /* , aNewBrowser */) => {
      if (aTopic === "swapping") {
        const infoBarVisible = this.notificationBox.getNotificationWithValue(
          "translation",
        );
        if (infoBarVisible) {
          this.showTranslationInfoBar();
        }
        return true;
      }

      if (aTopic !== "showing") {
        return false;
      }
      const translationNotification = this.notificationBox.getNotificationWithValue(
        "translation",
      );
      if (translationNotification) {
        translationNotification.close();
      } else {
        this.showTranslationInfoBar();
      }
      return true;
    };

    // TODO: Figure out why this A. Doesn't show an url bar icon and
    // B. Shows a strangely rendered popup at the corner of the window instead next to the URL bar
    const addId = this.originalShown ? "translate" : "translated";
    PopupNotifications.show(
      this.browser,
      addId,
      null,
      addId + "-notification-icon",
      null,
      null,
      { dismissed: true, eventCallback: callback },
    );
  }

  showTranslationInfoBarIfNotAlreadyShown() {
    const infoBarVisible = this.notificationBox.getNotificationWithValue(
      "translation",
    );
    if (!infoBarVisible) {
      this.showTranslationInfoBar();
    }
  }

  showTranslationInfoBar() {
    console.debug("showTranslationInfoBar");
    const notificationBox = this.notificationBox;
    const chromeWin = this.browser.ownerGlobal;
    const notif = notificationBox.appendNotification(
      "",
      "translation",
      null,
      notificationBox.PRIORITY_INFO_HIGH,
      null,
      null,
      `translation-notification-${chromeWin.now}`,
    );
    notif.init(this.translationBrowserChromeUiNotificationManager);
    return notif;
  }
}
