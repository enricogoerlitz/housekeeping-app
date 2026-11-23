import { updateProfile, useCurrentMember } from '@housekeeping/api';
import {
  addDislike,
  DISLIKES_FULL,
  MAX_DISLIKES,
  PROFILE_COLORS,
  profileDraftChanged,
  profileDraftErrors,
  profileDraftFrom,
  type DietPreference,
  type ProfileDraft,
} from '@housekeeping/core';
import {
  Avatar,
  Button,
  Chip,
  ChoiceChips,
  Row,
  Sheet,
  Stack,
  Text,
  TextField,
} from '@housekeeping/ui';
import { useState } from 'react';

import { useOnlineOnly } from '@/features/shell/offline';
import { errorMessage } from '@/features/shell/error-message';

// Spec 0027, REQ-003: "Profil bearbeiten" — name, colour, diet and dislikes of the signed-in
// person; the address only to read. Online only; closing with changes asks first (AC-011).

const DIETS: { value: DietPreference; label: string }[] = [
  { value: 'flexible', label: 'isst alles' },
  { value: 'vegetarian', label: 'vegetarisch' },
  { value: 'vegan', label: 'vegan' },
];

export function ProfileSheet(props: { email: string; onClose: () => void }) {
  const me = useCurrentMember();
  const online = useOnlineOnly();
  const [draft, setDraft] = useState<ProfileDraft>(() => profileDraftFrom(me));
  const [nameError, setNameError] = useState<string>();
  const [dislike, setDislike] = useState('');
  const [dislikeError, setDislikeError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const full = draft.dislikes.length >= MAX_DISLIKES;

  const update = (patch: Partial<ProfileDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setSaveError(undefined);
  };
  const close = () => {
    if (busy) return;
    if (profileDraftChanged(me, draft)) setAsking(true);
    else props.onClose();
  };
  const add = () => {
    const result = addDislike(draft.dislikes, dislike);
    setDislikeError(result.error);
    if (!result.error) setDislike('');
    update({ dislikes: result.dislikes });
  };
  const save = async () => {
    const errors = profileDraftErrors(draft);
    setNameError(errors.name);
    if (errors.name || busy) return;
    if (!profileDraftChanged(me, draft)) {
      props.onClose();
      return;
    }
    setBusy(true);
    try {
      await updateProfile(draft);
      props.onClose();
    } catch (error) {
      // AC-013: the window stays open with every input.
      setSaveError(errorMessage(error));
      setBusy(false);
    }
  };

  return (
    <>
      <Sheet
        visible
        size="m"
        title="Profil bearbeiten"
        onClose={close}
        testID="profile-sheet"
        actions={{
          primary: {
            label: 'Speichern',
            icon: 'check',
            onPress: () => void save(),
            disabled: online.disabled || busy,
            hint: online.hint,
            testID: 'profile-save',
          },
        }}
        footer={
          saveError ? (
            <Text variant="small" color="warn" testID="profile-save-error">
              {saveError}
            </Text>
          ) : undefined
        }
      >
        <Stack gap={20}>
          <TextField
            label="Name"
            value={draft.name}
            onChangeText={(name) => {
              update({ name });
              setNameError(undefined);
            }}
            maxLength={80}
            error={nameError}
            editable={!online.disabled}
            testID="profile-name"
          />
          <Stack gap={8}>
            <Text variant="smallStrong">Farbe</Text>
            <Row wrap gap={8}>
              {PROFILE_COLORS.map((color) => (
                <Chip
                  key={color.hex}
                  label={color.name}
                  selected={draft.color === color.hex}
                  disabled={online.disabled}
                  onPress={() => update({ color: color.hex })}
                  testID={`profile-color-${color.name}`}
                />
              ))}
            </Row>
            <Row gap={8} style={{ alignItems: 'center' }}>
              <Avatar name={draft.name || me.name} color={draft.color} size="m" />
              <Text variant="small" color="muted">
                So sehen dich die anderen.
              </Text>
            </Row>
          </Stack>
          <Stack gap={8}>
            <Text variant="smallStrong">Ernährung</Text>
            <ChoiceChips<DietPreference>
              label="Ernährung"
              value={draft.dietPreference}
              onChange={(dietPreference) => update({ dietPreference })}
              options={DIETS}
              disabled={online.disabled}
              testID="profile-diet"
            />
          </Stack>
          <Stack gap={8}>
            <Text variant="smallStrong">Abneigungen</Text>
            {draft.dislikes.length > 0 ? (
              <Row wrap gap={8}>
                {draft.dislikes.map((item) => (
                  <Chip
                    key={item}
                    label={item}
                    removable
                    accessibilityLabel={`${item} entfernen`}
                    disabled={online.disabled}
                    onPress={() =>
                      update({ dislikes: draft.dislikes.filter((other) => other !== item) })
                    }
                    testID={`profile-dislike-${item}`}
                  />
                ))}
              </Row>
            ) : null}
            <TextField
              label="Abneigung hinzufügen"
              placeholder="z. B. Koriander"
              value={dislike}
              onChangeText={(value) => {
                setDislike(value);
                setDislikeError(undefined);
              }}
              onSubmitEditing={add}
              returnKeyType="done"
              maxLength={40}
              editable={!online.disabled && !full}
              error={dislikeError}
              hint={full ? DISLIKES_FULL : undefined}
              testID="profile-dislike-input"
            />
            <Button
              label="Abneigung hinzufügen"
              icon="plus"
              variant="secondary"
              size="sm"
              disabled={online.disabled || full || !dislike.trim()}
              hint={full ? DISLIKES_FULL : online.hint}
              onPress={add}
              testID="profile-dislike-add"
            />
          </Stack>
          <Stack gap={4}>
            <Text variant="smallStrong">Adresse</Text>
            <Text testID="profile-email">{props.email}</Text>
            <Text variant="small" color="muted">
              Kommt von Google und lässt sich hier nicht ändern.
            </Text>
          </Stack>
        </Stack>
      </Sheet>
      {asking ? (
        <Sheet
          visible
          size="s"
          title="Änderungen verwerfen?"
          onClose={() => setAsking(false)}
          testID="profile-discard"
          footer={
            <Row gap={10} style={{ justifyContent: 'flex-end' }}>
              <Button
                label="Weiter bearbeiten"
                variant="secondary"
                onPress={() => setAsking(false)}
                testID="profile-discard-keep"
              />
              <Button
                label="Verwerfen"
                onPress={() => {
                  setAsking(false);
                  props.onClose();
                }}
                testID="profile-discard-confirm"
              />
            </Row>
          }
        />
      ) : null}
    </>
  );
}
