"use client";

import { Expand, Trash2, X } from "lucide-react";
import type { BoardImage } from "@/app/content";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import styles from "./vision-board-gallery.module.css";

type VisionBoardGalleryProps = {
  images: (BoardImage & { src?: string })[];
  disabled: boolean;
  onCaptionChange: (id: string, caption: string) => void;
  onRemove: (id: string) => void;
};

export default function VisionBoardGallery({
  images,
  disabled,
  onCaptionChange,
  onRemove,
}: VisionBoardGalleryProps) {
  const {t} = useI18n();
  return (
    <div className={styles.gallery} data-single={images.length === 1}>
      {images.map((image, index) => {
        const label = t("Imagem de inspiração {count}", {count: index + 1});
        const description = image.caption.trim() || label;

        return (
          <figure className={styles.card} key={image.id}>
            <Dialog>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className={styles.imageButton}
                  aria-label={t("Ampliar imagem {count} do mural", {count: index + 1})}
                >
                  <span className={styles.imageFrame}>
                    <img src={image.src} alt={description} decoding="async" />
                  </span>
                  <span className={styles.expandHint}>
                    <Expand size={15} aria-hidden="true" /> {t("Ver imagem inteira")}
                  </span>
                </button>
              </DialogTrigger>
              <DialogContent className={styles.viewer} showCloseButton={false}>
                <div className={styles.viewerHeader}>
                  <DialogTitle className={styles.viewerTitle}>{label}</DialogTitle>
                  <DialogClose asChild>
                    <Button variant="ghost" size="icon" className={styles.closeButton} aria-label={t("Fechar imagem ampliada")}>
                      <X aria-hidden="true" />
                    </Button>
                  </DialogClose>
                </div>
                <div className={styles.viewerImage}>
                  <img src={image.src} alt={description} decoding="async" />
                </div>
                <DialogDescription className={styles.viewerCaption}>
                  {image.caption.trim() || t("Um espaço para olhar com calma o que você deseja cultivar.")}
                </DialogDescription>
              </DialogContent>
            </Dialog>
            <figcaption className={styles.caption}>
              <Input
                aria-label={t("Intenção da imagem {count}", {count: index + 1})}
                maxLength={2000}
                placeholder={t("O que esta imagem representa?")}
                value={image.caption}
                onChange={(event) => onCaptionChange(image.id, event.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                className={styles.removeButton}
                aria-label={t("Retirar imagem {count} do mural", {count: index + 1})}
                disabled={disabled}
                onClick={() => onRemove(image.id)}
              >
                <Trash2 size={16} aria-hidden="true" /> {t("Retirar do mural")}
              </Button>
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
