export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      flights: {
        Row: {
          aircraft: string | null;
          airline: string;
          created_at: string;
          destination: string;
          duration_minutes: number;
          flight_number: string;
          flown_on: string;
          id: string;
          origin: string;
        };
        Insert: {
          aircraft?: string | null;
          airline: string;
          created_at?: string;
          destination: string;
          duration_minutes: number;
          flight_number: string;
          flown_on: string;
          id?: string;
          origin: string;
        };
        Update: {
          aircraft?: string | null;
          airline?: string;
          created_at?: string;
          destination?: string;
          duration_minutes?: number;
          flight_number?: string;
          flown_on?: string;
          id?: string;
          origin?: string;
        };
        Relationships: [];
      };
      rail_line_stops: {
        Row: {
          didok: string | null;
          edited_fields: string[];
          junction: string | null;
          lat: number | null;
          line_id: string;
          lon: number | null;
          missing_since: string | null;
          sequence: number;
          sloid: string | null;
          stop_name: string;
          via: string;
        };
        Insert: {
          didok?: string | null;
          edited_fields?: string[];
          junction?: string | null;
          lat?: number | null;
          line_id: string;
          lon?: number | null;
          missing_since?: string | null;
          sequence: number;
          sloid?: string | null;
          stop_name: string;
          via: string;
        };
        Update: {
          didok?: string | null;
          edited_fields?: string[];
          junction?: string | null;
          lat?: number | null;
          line_id?: string;
          lon?: number | null;
          missing_since?: string | null;
          sequence?: number;
          sloid?: string | null;
          stop_name?: string;
          via?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rail_line_stops_line_id_fkey';
            columns: ['line_id'];
            isOneToOne: false;
            referencedRelation: 'rail_lines';
            referencedColumns: ['id'];
          },
        ];
      };
      rail_lines: {
        Row: {
          category: string;
          created_at: string;
          display_name: string;
          edited_fields: string[];
          has_geometry: boolean;
          id: string;
          missing_since: string | null;
          network_region: string;
          operators: string[];
          route_ids: string[];
          seasonal: boolean | null;
          terminal_a: string;
          terminal_b: string;
          trips_per_week: number | null;
          true_terminal_a: string;
          true_terminal_b: string;
        };
        Insert: {
          category: string;
          created_at?: string;
          display_name: string;
          edited_fields?: string[];
          has_geometry: boolean;
          id: string;
          missing_since?: string | null;
          network_region: string;
          operators: string[];
          route_ids?: string[];
          seasonal?: boolean | null;
          terminal_a: string;
          terminal_b: string;
          trips_per_week?: number | null;
          true_terminal_a: string;
          true_terminal_b: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          display_name?: string;
          edited_fields?: string[];
          has_geometry?: boolean;
          id?: string;
          missing_since?: string | null;
          network_region?: string;
          operators?: string[];
          route_ids?: string[];
          seasonal?: boolean | null;
          terminal_a?: string;
          terminal_b?: string;
          trips_per_week?: number | null;
          true_terminal_a?: string;
          true_terminal_b?: string;
        };
        Relationships: [];
      };
      rail_rides: {
        Row: {
          created_at: string;
          from_didok: string | null;
          id: string;
          line_id: string;
          ridden_on: string;
          to_didok: string | null;
        };
        Insert: {
          created_at?: string;
          from_didok?: string | null;
          id?: string;
          line_id: string;
          ridden_on: string;
          to_didok?: string | null;
        };
        Update: {
          created_at?: string;
          from_didok?: string | null;
          id?: string;
          line_id?: string;
          ridden_on?: string;
          to_didok?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'rail_rides_line_id_fkey';
            columns: ['line_id'];
            isOneToOne: false;
            referencedRelation: 'rail_lines';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
