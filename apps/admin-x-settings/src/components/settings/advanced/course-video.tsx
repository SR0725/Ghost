import React from 'react';
import TopLevelGroup from '../../top-level-group';
import useSettingGroup from '../../../hooks/use-setting-group';
import {SettingGroupContent, TextArea, TextField, Toggle, withErrorBoundary} from '@tryghost/admin-x-design-system';
import {getSettingValues} from '@tryghost/admin-x-framework/api/settings';

const CourseVideo: React.FC<{ keywords: string[] }> = ({keywords}) => {
    const {
        localSettings,
        isEditing,
        saveState,
        handleSave,
        handleCancel,
        updateSetting,
        handleEditingChange
    } = useSettingGroup();

    const [
        enabled,
        accountId,
        customerCode,
        apiToken,
        signingKeyId,
        signingKeyJwk
    ] = getSettingValues(localSettings, [
        'course_video_enabled',
        'course_video_cloudflare_account_id',
        'course_video_cloudflare_customer_code',
        'course_video_cloudflare_api_token',
        'course_video_cloudflare_signing_key_id',
        'course_video_cloudflare_signing_key_jwk'
    ]) as Array<string | boolean | null>;

    const values = (
        <SettingGroupContent
            columns={1}
            values={[
                {
                    key: 'status',
                    value: enabled ? 'Course videos are enabled' : 'Course videos are disabled'
                },
                {
                    key: 'cloudflare',
                    value: customerCode ? 'Cloudflare Stream is configured' : 'Cloudflare Stream is not configured'
                }
            ]}
        />
    );

    const inputs = (
        <SettingGroupContent>
            <div className='flex flex-col gap-6'>
                <Toggle
                    checked={!!enabled}
                    direction='rtl'
                    label='Enable course videos'
                    onChange={(e) => {
                        updateSetting('course_video_enabled', e.target.checked);
                    }}
                />
                <TextField
                    title='Cloudflare account ID'
                    value={accountId?.toString() || ''}
                    onChange={(e) => {
                        updateSetting('course_video_cloudflare_account_id', e.target.value);
                    }}
                />
                <TextField
                    hint='The customer code from your Stream iframe URL, without the customer- prefix.'
                    title='Cloudflare customer code'
                    value={customerCode?.toString() || ''}
                    onChange={(e) => {
                        updateSetting('course_video_cloudflare_customer_code', e.target.value);
                    }}
                />
                <TextField
                    hint='Used as a fallback when no signing key is configured, and to verify restricted Stream videos require signed URLs.'
                    title='Cloudflare API token'
                    type='password'
                    value={apiToken?.toString() || ''}
                    onChange={(e) => {
                        updateSetting('course_video_cloudflare_api_token', e.target.value);
                    }}
                />
                <TextField
                    title='Cloudflare signing key ID'
                    value={signingKeyId?.toString() || ''}
                    onChange={(e) => {
                        updateSetting('course_video_cloudflare_signing_key_id', e.target.value);
                    }}
                />
                <TextArea
                    hint='Private JWK returned by Cloudflare Stream signing key creation. Restricted videos must have Require Signed URLs enabled in Cloudflare Stream.'
                    title='Cloudflare signing key JWK'
                    value={signingKeyJwk?.toString() || ''}
                    onChange={(e) => {
                        updateSetting('course_video_cloudflare_signing_key_jwk', e.target.value);
                    }}
                />
            </div>
        </SettingGroupContent>
    );

    return (
        <TopLevelGroup
            description='Configure global video provider credentials for course-style videos at the top of posts.'
            isEditing={isEditing}
            keywords={keywords}
            navid='course-video'
            saveState={saveState}
            testId='course-video'
            title='Course video'
            onCancel={handleCancel}
            onEditingChange={handleEditingChange}
            onSave={handleSave}
        >
            {isEditing ? inputs : values}
        </TopLevelGroup>
    );
};

export default withErrorBoundary(CourseVideo, 'Course video');
