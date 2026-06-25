/** Visual styling for the Cognito Managed Login flow.
 *
 *  Mirrors the AWS OCR Lab frontend palette (AWS orange #ff9900 on a dark
 *  background) so the hosted login screen matches the in-app theme. Hex
 *  strings are RGBA, eight-digit. Keep in sync with
 *  packages/frontend/src/styles.css when brand colors move. */

export const cognitoManagedLoginSettings = {
  components: {
    form: {
      borderRadius: 14,
      logo: {
        location: 'CENTER',
        position: 'TOP',
        enabled: true,
        formInclusion: 'IN',
      },
      lightMode: {
        backgroundColor: '1a0f00ff',
        borderColor: 'ff9900ff',
      },
      darkMode: {
        backgroundColor: '1a0f00ff',
        borderColor: 'ff9900ff',
      },
    },
    pageBackground: {
      image: { enabled: false },
      lightMode: { color: '0a0500ff' },
      darkMode: { color: '0a0500ff' },
    },
    primaryButton: {
      lightMode: {
        defaults: { backgroundColor: 'ff9900ff', textColor: '0a0500ff' },
        hover: { backgroundColor: 'ffb84dff', textColor: '0a0500ff' },
        active: { backgroundColor: 'e68a00ff', textColor: '0a0500ff' },
      },
      darkMode: {
        defaults: { backgroundColor: 'ff9900ff', textColor: '0a0500ff' },
        hover: { backgroundColor: 'ffb84dff', textColor: '0a0500ff' },
        active: { backgroundColor: 'e68a00ff', textColor: '0a0500ff' },
      },
    },
    secondaryButton: {
      lightMode: {
        defaults: {
          backgroundColor: '2a1500ff',
          borderColor: '3a2500ff',
          textColor: 'ffffffff',
        },
        hover: {
          backgroundColor: '3a2500ff',
          borderColor: 'ff9900ff',
          textColor: 'ffffffff',
        },
        active: {
          backgroundColor: '3a2500ff',
          borderColor: 'ff9900ff',
          textColor: 'ffffffff',
        },
      },
      darkMode: {
        defaults: {
          backgroundColor: '2a1500ff',
          borderColor: '3a2500ff',
          textColor: 'ffffffff',
        },
        hover: {
          backgroundColor: '3a2500ff',
          borderColor: 'ff9900ff',
          textColor: 'ffffffff',
        },
        active: {
          backgroundColor: '3a2500ff',
          borderColor: 'ff9900ff',
          textColor: 'ffffffff',
        },
      },
    },
    pageText: {
      lightMode: {
        headingColor: 'ffffffff',
        bodyColor: 'e2e8f0ff',
        descriptionColor: '94a3b8ff',
      },
      darkMode: {
        headingColor: 'ffffffff',
        bodyColor: 'e2e8f0ff',
        descriptionColor: '94a3b8ff',
      },
    },
  },
  componentClasses: {
    input: {
      borderRadius: 10,
      lightMode: {
        defaults: {
          backgroundColor: '2a1500ff',
          borderColor: '3a2500ff',
        },
        placeholderColor: '94a3b8ff',
      },
      darkMode: {
        defaults: {
          backgroundColor: '2a1500ff',
          borderColor: '3a2500ff',
        },
        placeholderColor: '94a3b8ff',
      },
    },
    inputLabel: {
      lightMode: { textColor: 'e2e8f0ff' },
      darkMode: { textColor: 'e2e8f0ff' },
    },
    link: {
      lightMode: {
        defaults: { textColor: 'ff9900ff' },
        hover: { textColor: 'ffb84dff' },
      },
      darkMode: {
        defaults: { textColor: 'ff9900ff' },
        hover: { textColor: 'ffb84dff' },
      },
    },
    focusState: {
      lightMode: { borderColor: 'ff9900ff' },
      darkMode: { borderColor: 'ff9900ff' },
    },
    optionControls: {
      lightMode: {
        defaults: {
          backgroundColor: '2a1500ff',
          borderColor: '3a2500ff',
        },
        selected: {
          backgroundColor: 'ff9900ff',
          foregroundColor: '0a0500ff',
        },
      },
      darkMode: {
        defaults: {
          backgroundColor: '2a1500ff',
          borderColor: '3a2500ff',
        },
        selected: {
          backgroundColor: 'ff9900ff',
          foregroundColor: '0a0500ff',
        },
      },
    },
  },
  categories: {
    form: {
      displayGraphics: true,
      instructions: { enabled: false },
      languageSelector: { enabled: false },
      location: { horizontal: 'CENTER', vertical: 'CENTER' },
    },
    global: {
      colorSchemeMode: 'DARK',
      pageHeader: { enabled: false },
      pageFooter: { enabled: false },
      spacingDensity: 'REGULAR',
    },
    auth: {
      authMethodOrder: [[{ display: 'INPUT', type: 'USERNAME_PASSWORD' }]],
    },
  },
} as const;
