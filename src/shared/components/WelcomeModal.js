"use client";

import { useState, useEffect } from "react";
import Modal from "./Modal";
import Button from "./Button";
import { GITHUB_CONFIG } from "@/shared/constants/config";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";

export default function WelcomeModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const { copied, copy } = useCopyToClipboard(2000);

  useEffect(() => {
    const neverShow = localStorage.getItem("9router:welcomeNeverShow") === "true";
    const justLoggedIn = sessionStorage.getItem("9router:justLoggedIn") === "true";

    if (neverShow || !justLoggedIn) {
      setIsOpen(false);
    } else {
      sessionStorage.removeItem("9router:justLoggedIn");
      setIsOpen(true);
    }

    fetch("/api/version")
      .then((res) => res.json())
      .then((data) => {
        if (data && data.hasUpdate) {
          setUpdateInfo(data);
        }
      })
      .catch(() => {});
  }, []);

  const handleDontShowAgain = () => {
    localStorage.setItem("9router:welcomeNeverShow", "true");
    setIsOpen(false);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  if (!isOpen) return null;

  const installCmd = updateInfo?.installCmd || "npm i -g 9router@latest --prefer-online";

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Welcome to 9Router!"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={handleDontShowAgain}>
            Don't show again
          </Button>
          <Button variant="secondary" onClick={handleClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-text-main text-sm">
        <p>
          Thank you for using 9Router! If you find this project helpful, please support us by starring our repository on GitHub.
        </p>

        <div>
          <a
            href={GITHUB_CONFIG.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block"
          >
            <Button variant="primary" icon="star">
              Star on GitHub
            </Button>
          </a>
        </div>

        {updateInfo && (
          <div className="mt-4 p-4 rounded-xl bg-surface-2 border border-border-subtle space-y-2">
            <h3 className="font-semibold text-amber-500 flex items-center gap-1.5">
              <span>🚀</span> Update Available!
            </h3>
            <p className="text-text-muted text-xs">
              {updateInfo.behindBy} commit(s) behind master.
            </p>
            {updateInfo.commitMessage && (
              <p className="text-xs text-text-main font-mono bg-bg/50 p-2 rounded border border-border-subtle">
                {updateInfo.commitMessage}
              </p>
            )}
            <div className="flex items-center gap-2 pt-1">
              <code className="flex-1 text-xs font-mono bg-bg px-2.5 py-1.5 rounded border border-border-subtle overflow-x-auto select-all">
                {installCmd}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copy(installCmd)}
                icon={copied ? "check" : "content_copy"}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
