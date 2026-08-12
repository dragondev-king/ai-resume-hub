import React from 'react';
import type { ResumeTemplate } from '../resumeTemplates';

type ResumeTemplatePreviewProps = {
  template: ResumeTemplate;
  className?: string;
};

const SECTION_LABELS: Record<string, string> = {
  summary: 'Summary',
  skills: 'Skills',
  education: 'Education',
  experience: 'Experience',
};

/**
 * Miniature HTML mock of a resume layout for gallery / picker previews.
 * Reflects template colors, header alignment, contact layout, and section order.
 */
const ResumeTemplatePreview: React.FC<ResumeTemplatePreviewProps> = ({
  template,
  className = '',
}) => {
  const primary = `#${template.colors.primary}`;
  const accent = `#${template.colors.accent}`;
  const body = `#${template.colors.body}`;
  const muted = `#${template.colors.muted}`;
  const nameCentered = template.header.nameAlign === 'center';
  const nameText =
    template.header.nameTransform === 'uppercase' ? 'JORDAN LEE' : 'Jordan Lee';

  const sectionTitle = (id: string) => {
    const label = SECTION_LABELS[id] || id;
    const text = template.sectionStyle.allCaps ? label.toUpperCase() : label;
    return (
      <div className="mb-0.5" style={{ marginTop: 5 }}>
        <div
          className="text-[5px] font-semibold tracking-wide leading-none"
          style={{
            color: primary,
            fontFamily: template.fonts.heading,
            borderBottom: template.sectionStyle.underline ? `1px solid ${accent}` : undefined,
            paddingBottom: template.sectionStyle.underline ? 1 : 0,
          }}
        >
          {text}
        </div>
      </div>
    );
  };

  const lines = (widths: number[], color = muted) =>
    widths.map((w, i) => (
      <div
        key={i}
        className="h-[2px] rounded-sm mb-[2px]"
        style={{ width: `${w}%`, backgroundColor: color, opacity: 0.55 }}
      />
    ));

  return (
    <div
      className={`bg-white shadow-sm overflow-hidden select-none pointer-events-none ${className}`}
      style={{
        aspectRatio: '8.5 / 11',
        fontFamily: template.fonts.body,
        border: `1px solid ${muted}33`,
      }}
      aria-hidden
    >
      <div className="h-full p-[7%] flex flex-col" style={{ color: body }}>
        {/* Header */}
        <div className={nameCentered ? 'text-center' : 'text-left'}>
          <div
            className="text-[9px] font-bold leading-tight tracking-wide"
            style={{ color: primary, fontFamily: template.fonts.heading }}
          >
            {nameText}
          </div>
          {template.header.showRole && (
            <div className="text-[5px] mt-[1px] leading-none" style={{ color: accent }}>
              Senior Software Engineer
            </div>
          )}
          {template.contact.layout === 'inline' ? (
            <div className="text-[4px] mt-[3px] leading-none" style={{ color: muted }}>
              jordan@email.com · (555) 010-2030 · City, ST
            </div>
          ) : (
            <div className="text-[4px] mt-[3px] leading-[1.35]" style={{ color: muted }}>
              <div>jordan@email.com</div>
              <div>(555) 010-2030</div>
              <div>City, ST</div>
            </div>
          )}
          {template.header.underlineAfterContact && (
            <div
              className="mt-[4px] mb-[2px]"
              style={{
                height: 1.5,
                backgroundColor: primary,
                width: nameCentered ? '70%' : '100%',
                marginLeft: nameCentered ? '15%' : 0,
              }}
            />
          )}
        </div>

        {/* Sections */}
        <div className="flex-1 min-h-0 mt-1">
          {template.sectionOrder.map((sectionId) => (
            <div key={sectionId}>
              {sectionTitle(sectionId)}
              {sectionId === 'summary' && lines([100, 92, 78], body)}
              {sectionId === 'skills' &&
                (template.skills.categorized ? (
                  <>
                    {lines([88], primary)}
                    {lines([95], muted)}
                    {lines([72], primary)}
                    {lines([90], muted)}
                  </>
                ) : (
                  lines([98, 70], muted)
                ))}
              {sectionId === 'education' && (
                <>
                  {lines([55], primary)}
                  {lines([40], muted)}
                </>
              )}
              {sectionId === 'experience' &&
                (template.experience.layout === 'twoColumn' ? (
                  <div className="flex gap-1">
                    <div className="w-[28%]">{lines([90, 70], muted)}</div>
                    <div className="flex-1">
                      {lines([60], primary)}
                      {lines([100, 85, 92], muted)}
                    </div>
                  </div>
                ) : (
                  <>
                    {lines([65], primary)}
                    {lines([45], muted)}
                    {lines([100, 88, 94], muted)}
                  </>
                ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ResumeTemplatePreview;
