import { when } from "mobx";
import { TranslationStatus } from "../../../shared-resources/models/BaseTranslationState";
import { getSnapshot } from "mobx-keystone";
import { telemetry } from "../telemetry/Telemetry";
import { ExtensionState } from "../../../shared-resources/models/ExtensionState";

export const translateAllFramesInTab = async (
  tabId: number,
  from: string,
  to: string,
  extensionState: ExtensionState,
) => {
  // Start timing
  const start = performance.now();
  // Request translation of all frames in a specific tab
  extensionState.requestTranslationOfAllFramesInTab(tabId, from, to);
  // Wait for translation in all frames in tab to complete
  await when(() => {
    const { tabTranslationStates } = extensionState;
    const currentTabTranslationState = tabTranslationStates.get(tabId);
    return (
      currentTabTranslationState &&
      [TranslationStatus.TRANSLATED, TranslationStatus.ERROR].includes(
        currentTabTranslationState.translationStatus,
      )
    );
  });
  // End timing
  const end = performance.now();
  const perceivedTranslationWallTimeMs = end - start;

  const { tabTranslationStates } = extensionState;
  const currentTabTranslationState = getSnapshot(
    tabTranslationStates.get(tabId),
  );

  const {
    totalModelLoadWallTimeMs,
    totalTranslationEngineRequestCount,
    totalTranslationWallTimeMs,
    wordCount,
    translationStatus,
    modelDownloadProgress,
  } = currentTabTranslationState;

  if (translationStatus === TranslationStatus.TRANSLATED) {
    // Record "translation attempt concluded" telemetry
    const perceivedSeconds = perceivedTranslationWallTimeMs / 1000;
    const perceivedWordsPerSecond = Math.round(wordCount / perceivedSeconds);
    const translationEngineWordsPerSecond = Math.round(
      wordCount / (totalTranslationWallTimeMs / 1000),
    );
    const modelDownloadTimeMs = modelDownloadProgress.durationMs || 0;
    const unaccountedTimeMs =
      perceivedTranslationWallTimeMs -
      modelDownloadTimeMs -
      totalTranslationWallTimeMs;
    console.info(
      `Translation of all text in tab with id ${tabId} (${wordCount} words) took ${perceivedSeconds} secs (perceived as ${perceivedWordsPerSecond} words per second) across ${totalTranslationEngineRequestCount} translation engine requests (which took ${totalTranslationWallTimeMs /
        1000} seconds, operating at ${translationEngineWordsPerSecond} words per second). Model loading took ${totalModelLoadWallTimeMs /
        1000} seconds, after spending ${modelDownloadTimeMs / 1000} seconds ${
        modelDownloadProgress.bytesToDownload === 0
          ? "hydrating"
          : "downloading and persisting"
      } model files. The remaining ${unaccountedTimeMs /
        1000} seconds where spent elsewhere.`,
    );
    telemetry.onTranslationFinished(
      from,
      to,
      totalModelLoadWallTimeMs,
      totalTranslationWallTimeMs,
      translationEngineWordsPerSecond,
      modelDownloadTimeMs,
    );
  } else {
    // TODO: Record error telemetry
  }
};