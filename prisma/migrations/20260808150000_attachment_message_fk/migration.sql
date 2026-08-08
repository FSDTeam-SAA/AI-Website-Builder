-- Link attachments to the message they were sent with. SET NULL rather than
-- CASCADE: an orphaned image is harmless, and deleting a message should not
-- silently destroy what the user uploaded.
ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
