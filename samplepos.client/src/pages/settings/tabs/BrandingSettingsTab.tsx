import { useState, useEffect, useRef } from 'react';
import { api } from '../../../services/api';
import { useSubmitOnEnter } from '../../../hooks/useSubmitOnEnter';

interface BrandingData {
    pwaName: string;
    pwaShortName: string;
    pwaThemeColor: string;
    pwaBackgroundColor: string;
    hasCustomIcon: boolean;
    icon192Url: string | null;
    icon512Url: string | null;
}

export default function BrandingSettingsTab() {
    const [branding, setBranding] = useState<BrandingData>({
        pwaName: '',
        pwaShortName: '',
        pwaThemeColor: '#3b82f6',
        pwaBackgroundColor: '#0f172a',
        hasCustomIcon: false,
        icon192Url: null,
        icon512Url: null,
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadBranding();
    }, []);

    async function loadBranding() {
        try {
            const res = await api.get('/tenant/branding');
            if (res.data.success) {
                setBranding(res.data.data);
            }
        } catch {
            // Use defaults if endpoint not available
        } finally {
            setLoading(false);
        }
    }

    async function handleSave() {
        setSaving(true);
        setMessage(null);
        try {
            const res = await api.put('/tenant/branding', {
                pwaName: branding.pwaName,
                pwaShortName: branding.pwaShortName,
                pwaThemeColor: branding.pwaThemeColor,
                pwaBackgroundColor: branding.pwaBackgroundColor,
            });
            if (res.data.success) {
                setMessage({ type: 'success', text: 'Branding saved. Users who reinstall the app will see the new name and colors.' });
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Failed to save branding settings.' });
        } finally {
            setSaving(false);
        }
    }

    async function handleIconUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        setMessage(null);
        try {
            const formData = new FormData();
            formData.append('icon', file);
            const res = await api.post('/tenant/branding/icon', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            if (res.data.success) {
                setBranding(prev => ({
                    ...prev,
                    hasCustomIcon: true,
                    icon192Url: res.data.data.icon192,
                    icon512Url: res.data.data.icon512,
                }));
                setMessage({ type: 'success', text: 'Icon uploaded successfully.' });
            }
        } catch {
            setMessage({ type: 'error', text: 'Failed to upload icon. Use a PNG or JPEG under 2MB.' });
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }

    useSubmitOnEnter(true, !saving, handleSave);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h2 className="text-lg font-semibold text-gray-900">PWA Branding</h2>
                <p className="text-sm text-gray-500 mt-1">
                    Customize how the app appears when installed on mobile devices. Each tenant gets its own app name and icon on the home screen.
                </p>
            </div>

            {/* Messages */}
            {message && (
                <div className={`rounded-lg p-4 text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
                    }`}>
                    {message.text}
                </div>
            )}

            {/* App Name */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label htmlFor="pwaName" className="block text-sm font-medium text-gray-700 mb-1">
                        App Name
                    </label>
                    <input
                        id="pwaName"
                        type="text"
                        value={branding.pwaName}
                        onChange={e => setBranding(prev => ({ ...prev, pwaName: e.target.value }))}
                        placeholder="e.g. Dynamics Pharmacy"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        maxLength={255}
                    />
                    <p className="text-xs text-gray-400 mt-1">Full name shown in app install prompts</p>
                </div>

                <div>
                    <label htmlFor="pwaShortName" className="block text-sm font-medium text-gray-700 mb-1">
                        Short Name
                    </label>
                    <input
                        id="pwaShortName"
                        type="text"
                        value={branding.pwaShortName}
                        onChange={e => setBranding(prev => ({ ...prev, pwaShortName: e.target.value }))}
                        placeholder="e.g. Dynamics"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        maxLength={12}
                    />
                    <p className="text-xs text-gray-400 mt-1">Shown under the app icon on home screen (max 12 chars)</p>
                </div>
            </div>

            {/* Colors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label htmlFor="pwaThemeColor" className="block text-sm font-medium text-gray-700 mb-1">
                        Theme Color
                    </label>
                    <div className="flex items-center gap-3">
                        <input
                            id="pwaThemeColor"
                            type="color"
                            value={branding.pwaThemeColor}
                            onChange={e => setBranding(prev => ({ ...prev, pwaThemeColor: e.target.value }))}
                            className="h-10 w-14 rounded border border-gray-300 cursor-pointer"
                        />
                        <input
                            type="text"
                            value={branding.pwaThemeColor}
                            onChange={e => {
                                const v = e.target.value;
                                if (/^#[0-9a-fA-F]{0,6}$/.test(v)) {
                                    setBranding(prev => ({ ...prev, pwaThemeColor: v }));
                                }
                            }}
                            className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
                            maxLength={7}
                        />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Status bar and header color on mobile</p>
                </div>

                <div>
                    <label htmlFor="pwaBackgroundColor" className="block text-sm font-medium text-gray-700 mb-1">
                        Background Color
                    </label>
                    <div className="flex items-center gap-3">
                        <input
                            id="pwaBackgroundColor"
                            type="color"
                            value={branding.pwaBackgroundColor}
                            onChange={e => setBranding(prev => ({ ...prev, pwaBackgroundColor: e.target.value }))}
                            className="h-10 w-14 rounded border border-gray-300 cursor-pointer"
                        />
                        <input
                            type="text"
                            value={branding.pwaBackgroundColor}
                            onChange={e => {
                                const v = e.target.value;
                                if (/^#[0-9a-fA-F]{0,6}$/.test(v)) {
                                    setBranding(prev => ({ ...prev, pwaBackgroundColor: v }));
                                }
                            }}
                            className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
                            maxLength={7}
                        />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Splash screen background when app launches</p>
                </div>
            </div>

            {/* Icon Upload */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    App Icon
                </label>
                <div className="flex items-start gap-6">
                    {/* Preview */}
                    <div className="flex-shrink-0">
                        <div
                            className="w-20 h-20 rounded-2xl border-2 border-gray-200 overflow-hidden flex items-center justify-center"
                            style={{ backgroundColor: branding.pwaBackgroundColor }}
                        >
                            {branding.hasCustomIcon && branding.icon192Url ? (
                                <img
                                    src={branding.icon192Url}
                                    alt="App icon"
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                            )}
                        </div>
                    </div>

                    {/* Upload controls */}
                    <div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/png,image/jpeg"
                            onChange={handleIconUpload}
                            className="hidden"
                            id="icon-upload"
                        />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                            {uploading ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2" />
                                    Uploading...
                                </>
                            ) : (
                                'Upload Icon'
                            )}
                        </button>
                        <p className="text-xs text-gray-400 mt-2">
                            PNG or JPEG, recommended 512x512px. Max 2MB.
                        </p>
                    </div>
                </div>
            </div>

            {/* Preview */}
            <div className="bg-gray-100 rounded-xl p-6">
                <h3 className="text-sm font-medium text-gray-600 mb-3">Home Screen Preview</h3>
                <div className="flex items-center gap-8">
                    <div className="flex flex-col items-center gap-2">
                        <div
                            className="w-16 h-16 rounded-2xl shadow-lg overflow-hidden flex items-center justify-center"
                            style={{ backgroundColor: branding.pwaBackgroundColor }}
                        >
                            {branding.hasCustomIcon && branding.icon192Url ? (
                                <img src={branding.icon192Url} alt="Preview" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-white text-lg font-bold">
                                    {(branding.pwaShortName || 'POS').charAt(0)}
                                </span>
                            )}
                        </div>
                        <span className="text-xs text-gray-700 font-medium text-center max-w-[80px] truncate">
                            {branding.pwaShortName || 'POS'}
                        </span>
                    </div>
                    <div className="text-sm text-gray-500">
                        <p>This is how the app will appear on the user&apos;s home screen after installation.</p>
                    </div>
                </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-4 border-t border-gray-200">
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center px-6 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                    {saving ? (
                        <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                            Saving...
                        </>
                    ) : (
                        'Save Branding'
                    )}
                </button>
            </div>
        </div>
    );
}
