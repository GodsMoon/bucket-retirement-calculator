import React from 'react';

export type Profile = 'Default' | 'Donation' | 'Custom';

interface ProfileSelectorProps {
  activeProfile: Profile;
  onProfileChange: (profile: Profile) => void;
}

const profiles: Profile[] = ['Default', 'Donation', 'Custom'];

const ProfileSelector: React.FC<ProfileSelectorProps> = ({ activeProfile, onProfileChange }) => {
  return (
    <div className="flex space-x-2">
      {profiles.map(p => (
        <button
          key={p}
          className={`px-3 py-1 rounded ${activeProfile === p
            ? 'bg-blue-600 text-white dark:bg-blue-400 dark:text-slate-900'
            : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100'}`}
          onClick={() => onProfileChange(p)}
        >
          {p}
        </button>
      ))}
    </div>
  );
};

export default ProfileSelector;
