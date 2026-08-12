import React from 'react';
import type { ResumeTemplate } from '../resumeTemplates';
import { parseBoldMarkup } from '../utils/resumeLayout';

export type ResumeTemplatePreviewVariant = 'compact' | 'expanded';

type ResumeTemplatePreviewProps = {
  template: ResumeTemplate;
  className?: string;
  variant?: ResumeTemplatePreviewVariant;
};

const SECTION_LABELS: Record<string, string> = {
  summary: 'Summary',
  skills: 'Skills',
  education: 'Education',
  experience: 'Experience',
};

/** Shared mock content for gallery / expanded previews. */
export const MOCK_RESUME_PREVIEW = {
  firstName: 'Jordan',
  lastName: 'Lee',
  role: 'Senior Software Engineer',
  email: 'jordan.lee@email.com',
  phone: '(555) 010-2030',
  location: 'Austin, TX',
  linkedin: 'linkedin.com/in/jordanlee',
  summary:
    'Results-driven engineer with <b>8+ years</b> building scalable web platforms and APIs. Known for pairing strong product sense with clean architecture, mentoring teams, and shipping reliable features under tight deadlines.',
  skillsCategorized: [
    { label: 'Programming Languages', skills: 'TypeScript, JavaScript, Python, Go, SQL' },
    { label: 'Frameworks & Libraries', skills: 'React, Node.js, Next.js, Express, Django' },
    { label: 'Cloud & DevOps', skills: 'AWS, Docker, Kubernetes, CI/CD, Terraform' },
    { label: 'Databases', skills: 'PostgreSQL, Redis, MongoDB, Elasticsearch' },
  ],
  skillsFlat: [
    'TypeScript',
    'React',
    'Node.js',
    'AWS',
    'PostgreSQL',
    'Docker',
    'System Design',
    'Agile Leadership',
  ],
  education: [
    {
      school: 'University of Texas at Austin',
      degree: 'B.S. Computer Science',
      years: '2012 – 2016',
    },
  ],
  experience: [
    {
      company: 'Northwind Labs',
      title: 'Senior Software Engineer',
      dates: 'Jan 2021 – Present',
      address: 'Austin, TX',
      bullets: [
        'Led redesign of billing platform serving <b>120k+</b> customers; cut incident rate by 40%.',
        'Built event-driven services in TypeScript/Node that process 2M+ daily messages.',
        'Mentored 4 engineers and established code-review and on-call practices.',
      ],
    },
    {
      company: 'Brightline Soft',
      title: 'Software Engineer',
      dates: 'Jun 2017 – Dec 2020',
      address: 'Remote',
      bullets: [
        'Shipped customer dashboard used by 800+ enterprise accounts.',
        'Improved API p95 latency from 480ms to 140ms through caching and query tuning.',
      ],
    },
  ],
} as const;

function BoldMarkupText({ text }: { text: string }) {
  return (
    <>
      {parseBoldMarkup(text).map((seg, i) =>
        seg.bold ? <strong key={i}>{seg.text}</strong> : <React.Fragment key={i}>{seg.text}</React.Fragment>
      )}
    </>
  );
}

/**
 * HTML mock of a resume layout for gallery / picker previews.
 * `compact` = thumbnail; `expanded` = full readable mock with rich content.
 */
const ResumeTemplatePreview: React.FC<ResumeTemplatePreviewProps> = ({
  template,
  className = '',
  variant = 'compact',
}) => {
  const primary = `#${template.colors.primary}`;
  const accent = `#${template.colors.accent}`;
  const body = `#${template.colors.body}`;
  const muted = `#${template.colors.muted}`;
  const expanded = variant === 'expanded';
  const nameCentered = template.header.nameAlign === 'center';
  const fullName = `${MOCK_RESUME_PREVIEW.firstName} ${MOCK_RESUME_PREVIEW.lastName}`;
  const nameText =
    template.header.nameTransform === 'uppercase' ? fullName.toUpperCase() : fullName;

  const pad = expanded ? '8%' : '7%';
  const nameSize = expanded ? Math.max(18, template.sizes.name * 0.85) : 9;
  const titleSize = expanded ? Math.max(11, template.sizes.title * 0.9) : 5;
  const sectionSize = expanded ? Math.max(11, template.sizes.section * 0.95) : 5;
  const bodySize = expanded ? Math.max(10, template.sizes.body * 1.15) : 4.5;
  const contactSize = expanded ? Math.max(10, template.sizes.contact * 1.1) : 4;
  const metaSize = expanded ? Math.max(9, template.sizes.experienceMeta) : 4;
  const expHeadingSize = expanded
    ? Math.max(10, template.sizes.experienceHeading * 0.95)
    : 4.5;

  const sectionTitle = (id: string) => {
    const label = SECTION_LABELS[id] || id;
    const text = template.sectionStyle.allCaps ? label.toUpperCase() : label;
    return (
      <div style={{ marginTop: expanded ? 14 : 5, marginBottom: expanded ? 6 : 2 }}>
        <div
          style={{
            color: primary,
            fontFamily: template.fonts.heading,
            fontSize: sectionSize,
            fontWeight: 700,
            letterSpacing: template.sectionStyle.allCaps ? '0.04em' : undefined,
            borderBottom: template.sectionStyle.underline ? `1.5px solid ${accent}` : undefined,
            paddingBottom: template.sectionStyle.underline ? (expanded ? 3 : 1) : 0,
            lineHeight: 1.2,
          }}
        >
          {text}
        </div>
      </div>
    );
  };

  const renderSummary = () => (
    <p
      style={{
        fontSize: bodySize,
        lineHeight: expanded ? 1.45 : 1.25,
        margin: 0,
        color: body,
      }}
    >
      <BoldMarkupText text={MOCK_RESUME_PREVIEW.summary} />
    </p>
  );

  const renderSkills = () => {
    if (!template.skills.categorized) {
      return (
        <p style={{ fontSize: bodySize, lineHeight: 1.35, margin: 0, color: body }}>
          {MOCK_RESUME_PREVIEW.skillsFlat.join(', ')}
        </p>
      );
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: expanded ? 4 : 1 }}>
        {MOCK_RESUME_PREVIEW.skillsCategorized.map((cat) => (
          <p key={cat.label} style={{ fontSize: bodySize, lineHeight: 1.35, margin: 0, color: body }}>
            <strong style={{ color: primary }}>{cat.label}: </strong>
            {cat.skills}
          </p>
        ))}
      </div>
    );
  };

  const renderEducation = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: expanded ? 6 : 2 }}>
      {MOCK_RESUME_PREVIEW.education.map((edu) => (
        <div key={edu.school}>
          <div
            style={{
              fontSize: expHeadingSize,
              fontWeight: 700,
              color: primary,
              fontFamily: template.fonts.heading,
              lineHeight: 1.2,
            }}
          >
            {edu.school}
          </div>
          <div style={{ fontSize: bodySize, color: body, lineHeight: 1.3 }}>{edu.degree}</div>
          <div style={{ fontSize: metaSize, color: muted, lineHeight: 1.3 }}>{edu.years}</div>
        </div>
      ))}
    </div>
  );

  const renderExperienceEntry = (
    exp: (typeof MOCK_RESUME_PREVIEW.experience)[number],
    index: number
  ) => {
    const bullets = (
      <ul
        style={{
          margin: expanded ? '4px 0 0' : '1px 0 0',
          paddingLeft: expanded ? 16 : 8,
          display: 'flex',
          flexDirection: 'column',
          gap: expanded ? 3 : 1,
        }}
      >
        {exp.bullets.map((b, i) => (
          <li key={i} style={{ fontSize: bodySize, lineHeight: expanded ? 1.4 : 1.25, color: body }}>
            <BoldMarkupText text={b} />
          </li>
        ))}
      </ul>
    );

    if (template.experience.layout === 'twoColumn') {
      return (
        <div
          key={`${exp.company}-${index}`}
          style={{
            display: 'flex',
            gap: expanded ? 12 : 4,
            marginBottom: expanded ? 10 : 3,
          }}
        >
          <div style={{ width: expanded ? '28%' : '30%', flexShrink: 0 }}>
            <div style={{ fontSize: metaSize, color: muted, lineHeight: 1.3 }}>{exp.dates}</div>
            {template.experience.showAddress && (
              <div style={{ fontSize: metaSize, color: muted, lineHeight: 1.3 }}>{exp.address}</div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: expHeadingSize,
                fontWeight: 700,
                color: primary,
                fontFamily: template.fonts.heading,
                lineHeight: 1.2,
              }}
            >
              {exp.company}
            </div>
            <div style={{ fontSize: bodySize, color: accent, lineHeight: 1.3, fontWeight: 600 }}>
              {exp.title}
            </div>
            {bullets}
          </div>
        </div>
      );
    }

    return (
      <div key={`${exp.company}-${index}`} style={{ marginBottom: expanded ? 10 : 3 }}>
        <div
          style={{
            fontSize: expHeadingSize,
            fontWeight: 700,
            color: primary,
            fontFamily: template.fonts.heading,
            lineHeight: 1.2,
          }}
        >
          {exp.company}
        </div>
        <div style={{ fontSize: bodySize, color: accent, lineHeight: 1.3, fontWeight: 600 }}>
          {exp.title}
        </div>
        <div style={{ fontSize: metaSize, color: muted, lineHeight: 1.3 }}>
          {exp.dates}
          {template.experience.showAddress ? ` · ${exp.address}` : ''}
        </div>
        {bullets}
      </div>
    );
  };

  const renderExperience = () => (
    <div>
      {MOCK_RESUME_PREVIEW.experience
        .slice(0, expanded ? undefined : 2)
        .map((exp, i) => renderExperienceEntry(exp, i))}
    </div>
  );

  const contactInline = [
    MOCK_RESUME_PREVIEW.email,
    MOCK_RESUME_PREVIEW.phone,
    MOCK_RESUME_PREVIEW.location,
  ].join(' · ');

  return (
    <div
      className={`bg-white shadow-sm overflow-hidden ${expanded ? '' : 'select-none'} ${className}`}
      style={{
        aspectRatio: expanded ? undefined : '8.5 / 11',
        minHeight: expanded ? undefined : undefined,
        fontFamily: template.fonts.body,
        border: `1px solid ${muted}33`,
      }}
    >
      <div
        className="flex flex-col"
        style={{
          padding: pad,
          color: body,
          minHeight: expanded ? 640 : '100%',
          height: expanded ? undefined : '100%',
        }}
      >
        <div className={nameCentered ? 'text-center' : 'text-left'}>
          <div
            style={{
              color: primary,
              fontFamily: template.fonts.heading,
              fontSize: nameSize,
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: template.header.nameTransform === 'uppercase' ? '0.03em' : undefined,
            }}
          >
            {nameText}
          </div>
          {template.header.showRole && (
            <div
              style={{
                color: accent,
                fontSize: titleSize,
                marginTop: expanded ? 4 : 1,
                fontWeight: 600,
                lineHeight: 1.2,
              }}
            >
              {MOCK_RESUME_PREVIEW.role}
            </div>
          )}
          {template.contact.layout === 'inline' ? (
            <div
              style={{
                color: muted,
                fontSize: contactSize,
                marginTop: expanded ? 8 : 3,
                lineHeight: 1.35,
              }}
            >
              {contactInline}
              {expanded && (
                <>
                  <br />
                  {MOCK_RESUME_PREVIEW.linkedin}
                </>
              )}
            </div>
          ) : (
            <div
              style={{
                color: muted,
                fontSize: contactSize,
                marginTop: expanded ? 8 : 3,
                lineHeight: 1.4,
              }}
            >
              <div>{MOCK_RESUME_PREVIEW.email}</div>
              <div>{MOCK_RESUME_PREVIEW.phone}</div>
              <div>{MOCK_RESUME_PREVIEW.location}</div>
              {expanded && <div>{MOCK_RESUME_PREVIEW.linkedin}</div>}
            </div>
          )}
          {template.header.underlineAfterContact && (
            <div
              style={{
                marginTop: expanded ? 10 : 4,
                marginBottom: expanded ? 4 : 2,
                height: expanded ? 2 : 1.5,
                backgroundColor: primary,
                width: nameCentered ? '72%' : '100%',
                marginLeft: nameCentered ? '14%' : 0,
              }}
            />
          )}
        </div>

        <div className="flex-1 min-h-0" style={{ marginTop: expanded ? 4 : 2 }}>
          {template.sectionOrder.map((sectionId) => (
            <div key={sectionId}>
              {sectionTitle(sectionId)}
              {sectionId === 'summary' && renderSummary()}
              {sectionId === 'skills' && renderSkills()}
              {sectionId === 'education' && renderEducation()}
              {sectionId === 'experience' && renderExperience()}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ResumeTemplatePreview;
