import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { useUpdateSharedSecret } from "@app/hooks/api";
import { TSharedSecret } from "@app/hooks/api/secretSharing";
import { UsePopUpState } from "@app/hooks/usePopUp";

const expiresInOptions = [
  { label: "5 min", value: "5m" },
  { label: "30 min", value: "30m" },
  { label: "1 hour", value: "1h" },
  { label: "1 day", value: "1d" },
  { label: "7 days", value: "7d" },
  { label: "14 days", value: "14d" },
  { label: "30 days", value: "30d" }
];

const schema = z.object({
  name: z.string().max(50).optional(),
  password: z.string().optional(),
  expiresIn: z.string(),
  emails: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        const emails = val
          .split(",")
          .map((email) => email.trim())
          .filter((email) => email !== "");
        if (emails.length > 100) return false;
        return emails.every((email) => z.string().email().safeParse(email).success);
      },
      { message: "Must be a comma-separated list of valid emails (max 100) or empty." }
    )
});

export type TEditShareSecretForm = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["editSharedSecret"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["editSharedSecret"]>,
    state?: boolean
  ) => void;
};

export const EditShareSecretModal = ({ popUp, handlePopUpToggle }: Props) => {
  const sharedSecret = popUp.editSharedSecret.data as TSharedSecret | undefined;
  const updateSharedSecret = useUpdateSharedSecret();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<TEditShareSecretForm>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", password: "", expiresIn: "30d", emails: "" }
  });

  // start each edit from a clean form
  useEffect(() => {
    if (!sharedSecret) return;

    reset({ name: "", password: "", expiresIn: "30d", emails: "" });
  }, [sharedSecret, reset]);

  const onSubmit = async (data: TEditShareSecretForm) => {
    if (!sharedSecret) return;

    const authorizedEmails = data.emails
      ? data.emails
          .split(",")
          .map((email) => email.trim())
          .filter((email) => email !== "")
      : [];

    try {
      await updateSharedSecret.mutateAsync({
        sharedSecretId: sharedSecret.id,
        name: data.name,
        expiresIn: data.expiresIn,
        authorizedEmails,
        ...(data.password ? { password: data.password } : {})
      });

      createNotification({ type: "success", text: "Successfully updated shared secret" });
      handlePopUpToggle("editSharedSecret", false);
    } catch (err) {
      createNotification({
        type: "error",
        text: (err as { message?: string })?.message ?? "Failed to update shared secret"
      });
    }
  };

  return (
    <Dialog
      open={popUp?.editSharedSecret?.isOpen}
      onOpenChange={(isOpen) => handlePopUpToggle("editSharedSecret", isOpen)}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit Shared Secret</DialogTitle>
          <DialogDescription>
            The link stays the same. The secret value itself cannot be changed.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Name</FieldLabel>
                <Input {...field} placeholder="API Key for John" />
                {error && <FieldError>{error.message}</FieldError>}
              </Field>
            )}
          />
          <Controller
            control={control}
            name="expiresIn"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Expires In</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an expiry" />
                  </SelectTrigger>
                  <SelectContent>
                    {expiresInOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Counted from now, not from when the link was made.
                </FieldDescription>
                {error && <FieldError>{error.message}</FieldError>}
              </Field>
            )}
          />
          <Controller
            control={control}
            name="password"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Password</FieldLabel>
                <Input
                  {...field}
                  type="password"
                  placeholder="Leave blank to keep the current one"
                />
                <FieldDescription>
                  Setting a new password replaces the old one immediately.
                </FieldDescription>
                {error && <FieldError>{error.message}</FieldError>}
              </Field>
            )}
          />
          <Controller
            control={control}
            name="emails"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Authorized Emails</FieldLabel>
                <Input {...field} placeholder="one@example.com, two@example.com" />
                {error && <FieldError>{error.message}</FieldError>}
              </Field>
            )}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handlePopUpToggle("editSharedSecret", false)}
            >
              Cancel
            </Button>
            <Button type="submit" isPending={isSubmitting}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
